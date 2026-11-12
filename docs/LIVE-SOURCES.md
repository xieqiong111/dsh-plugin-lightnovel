# 在线书源真实抓取验证（2026-11-12）

本报告记录一次**不使用离线 fixture** 的真实网络抓取验证：从飞牛 NAS 容器直连公开书站，
经真实 DeepSeek Harness runtime 调用六个工具，验证详情页、目录页、正文/插图与 EPUB 打包链路。
结论与证据可复现，复现脚本为 [`scripts/verify-live.mjs`](../scripts/verify-live.mjs)。

## 1. 合规边界（验证过程中始终遵守）

| 约束 | 落实方式 |
|------|----------|
| 仅公开页面 | 只用公开 http(s) GET；`assertSafePublicUrl()` 校验 host allowlist、标准端口、拒绝 credentials / 私有地址 |
| robots.txt | 每次抓取前由 `PoliteFetcher` 获取并解析；非 2xx/404/410 一律拒绝抓取；`Disallow` 路径不访问 |
| 限速 | TS 侧同主机最小 4 秒；Dart 核心自带 `RateLimitInterceptor`（文本 15 次/分、图片 10 次/分） |
| 无凭据 | `fetch` 显式 `credentials: 'omit'`，无 Cookie / Authorization；验证脚本断言环境里没有任何 token/key/secret |
| 不绕过访问控制 | 不处理登录、付费、验证码、Cloudflare 挑战；`wenku8` 保持 `restricted` 且默认禁用 |
| 最小抓取量 | 只验证 1 本书、1 卷；提供 `LN_LIVE_ALLOW_DOWNLOAD=0` 只读模式 |

> 上游 Dart `BiliNovelSource` 会发送一个静态的显示偏好头 `Cookie: night=0`（强制日间模式）。
> 它不含会话标识、用户数据或身份信息，也不用于绕过任何访问控制；本插件自身的
> `PoliteFetcher` 完全无 Cookie。验证不注入、不复用任何站点会话。

## 2. 目标站点预检（NAS 直连，`--noproxy '*'`）

| 目标 | DNS / 结果 | robots.txt | 结论 |
|------|-----------|-----------|------|
| `www.bilinovel.com` | `128.242.240.180` | 443 连接超时（8s） | **不可达**，不再作为默认域名 |
| `www.bilinovel.net` | `172.64.52.173` | `200`，191 B | 可用；`/novel/...`、`/search.html` 未被禁止 |
| `www.wenku8.net` | `104.21.95.119` | `403` Cloudflare 挑战页（4547 B） | **保持禁用**，不尝试绕过 |
| `www.linovelib.com` | `162.159.148.217` | `200`，191 B | 与 `.net` 同规则，作为 host 别名保留 |

`www.bilinovel.net/robots.txt` 实际内容：

```text
User-agent: *
Disallow: /*.php$
Disallow: /gocomic
Disallow: /themes
Disallow: /public
Disallow: /recentread
Disallow: /reviewshow
Disallow: /showtopic
Disallow: /support.html
Disallow: /fans
```

首页 `200` / 172674 B；公开详情页 `https://www.bilinovel.net/novel/2059.html`
`200` / 57285 B，标题 `安达与岛村_入间人间作品_电击文库_哔哩轻小说`，
含 `.book-title` 节点，与 Dart `BiliNovelSource._parseNovel()` 的选择器一致。

## 3. 关键发现：公开 GET 端点不是关键词搜索

插件原默认搜索模板 `https://www.bilinovel.com/search/?keyword={q}` 有双重问题：
域名不可达，且该路径返回 `404`。进一步对 `.net` 探测发现：

| 请求 | 结果 |
|------|------|
| `GET /search.html?keyword=安达与岛村` | `200` / 5768 B，6 个 `/novel/*.html` 链接 |
| `GET /search.html?keyword=刀剑神域` | `200` / 5759 B，**完全相同的 6 个链接** |
| `GET /search.html`（无参数） | `200` / 5713 B，仍是同样 6 个链接 |
| `GET /search.html?q=...` | 同上 |
| `GET /search/?keyword=...` | `404` |
| `POST /search.html`（`searchkey=...`） | `200` 但响应体为 0 B |

页面里的 6 个链接带 `class="btn-line-gray jsSearchLink"`，是**热门搜索推荐**，
不是关键词命中；关键词只出现在一段繁体站点跳转脚本里。站点真实搜索表单为
`method="post" action="/search.html"`，而其后端通常是 `*.php` 路由 —— 已被
`Disallow: /*.php$` 明确禁止。

**结论：不存在 robots 允许的公开 GET 关键词搜索端点。** 把推荐链接当作搜索结果返回会
产生「搜刀剑神域却得到安达与岛村」的伪造命中。因此实现上选择**诚实降级**：
默认不发起 live 搜索请求，`SearchEngine` 将其记入 `degradedSources`，结果来自本地索引 /
离线 fixture；只有运营者显式设置 `LN_BILINOVEL_SEARCH_URL`（指向确实可用的公开 GET
端点）时才发请求。

## 4. 本次修复（均为加性改动，未重写原 Dart 采集逻辑）

1. `src/sources/live.ts`
   - `biliNovelAdapter` 的 `info.baseUrl`、`baseUrl`、`searchUrlTemplate`、
     `canonicalDetailUrl` 全部从不可达的 `.com` 改为实测可达的 `.net`（也是上游
     `BiliNovelSource.baseUrl` 本来使用的值）。
   - 新增 `searchOptInOnly`：无 `LN_<ID>_SEARCH_URL` 时直接返回 `[]` 并写
     `live_search_opt_in_required` 日志，绝不伪造命中。
2. `src/core/bridge.ts` + `vendor/bili_novel_packer/lib/logger.dart`
   - **真实抓取才暴露的 bug**：上游日志用相对路径 `File('bili_novel.log')`，只有发生
     真实 HTTP 请求时才写文件；而 bridge 原先以只读的 `vendor/bili_novel_packer` 作为
     cwd，非 root 用户运行时 `PathAccessException: Permission denied`，Dart 进程退出 255。
     离线 fixture 验证不触发该写入，因此此前 13/13 验证未能发现。
   - 修复：AOT 二进制改以插件自有的可写 `dataDir` 为 cwd（`dart run` 回退仍用工程根），
     并通过 `BNP_LOG_FILE` 把日志固定到 `<dataDir>/logs/bili_novel.log` 绝对路径。
     绝对路径不受 `pack` 阶段 `Directory.current = outputDir` 影响，日志不会落进书库。
   - 原交互 CLI 行为不变（未设置该环境变量时仍写 `bili_novel.log`）。
3. 新增回归测试 `test/unit/live-sources.test.ts`、`test/unit/bridge.test.ts`，锁住
   canonical 域名、opt-in 降级与 spawn cwd/env。
4. `src/core/library.ts` + `scripts/verify-nas.mjs`（**最终一致性回归暴露的缺陷**）
   - 在线验证的 EPUB 与早先离线验证的 fixture EPUB 共用 `/data/library` 时，
     再次运行离线验证出现 `12/13`，失败项为 `library re-verification passes`：
     同一 `relativePath` 存在两条索引记录，旧记录的 sha256 指向已被覆盖的文件版本，
     全库复验因此误报损坏。这不是在线抓取失败，而是**重复下载同一卷会追加重复索引**
     的真实产品缺陷，普通用户重试下载同样会遇到。
   - 修复：`Library.add()` 按 `relativePath` 替换旧条目；`Library.load()` 对历史索引
     自动去重（保留最新条目，写 `deduplicated_index` 日志）并回写，实现自愈。
   - 两个验证脚本都显式固定隔离的 `dataDir` / `libraryDir`
     （离线：`/data/nas-verify/`，在线：`<LN_LIVE_DATA_DIR>/library`），
     验证数据不再与运营者真实书库交叉。
   - 新增 `test/unit/library.test.ts` 两个回归用例：重复下载替换、历史重复索引自愈。

## 5. 真实闭环验证

在 NAS 容器（`linux/amd64`，真实 Cordis `Context` + `ToolsService` + `SystemPrompt` +
`NativeToolExecutor`）中执行：

```bash
# 只读预检（不下载 EPUB）
docker run --rm --network dsh-lightnovel-net --user "$(id -u):$(id -g)" \
  -v "$PWD/data:/data" -e LN_LIVE_ALLOW_DOWNLOAD=0 \
  --entrypoint node dsh-plugin-lightnovel:1.0.0 \
  /opt/lightnovel/scripts/verify-live.mjs

# 完整闭环（含 1 卷真实 EPUB 下载）
docker run --rm --network dsh-lightnovel-net --user "$(id -u):$(id -g)" \
  -v "$PWD/data:/data" \
  --entrypoint node dsh-plugin-lightnovel:1.0.0 \
  /opt/lightnovel/scripts/verify-live.mjs
```

脚本检查项：robots 可达且 `/novel` 未被禁、无凭据环境、六工具注册、
`novel_details` 真实详情字段、`novel_volumes` 真实卷/章节、live 搜索诚实降级、
`novel_download` 真实下载完成、EPUB ZIP/mimetype/OPF/XHTML/中文正文、`novel_library`
复验、Dart 核心可用。可用 `LN_LIVE_DETAIL_URL` / `LN_LIVE_VOLUME` /
`LN_LIVE_QUERY` / `LN_LIVE_DATA_DIR` 覆盖。

**实测结果见第 7 节。**

## 6. 复现限制与已知边界

- 只验证 1 本公开书目、1 卷，用于证明链路可用，**不是**对站点做批量爬取。
- 若目标站点后续改版（域名、选择器、robots 规则），需要重新预检；本项目不提供
  任何反爬绕过手段。
- `wenku8` 在本次环境被 Cloudflare 403 拦截；按设计保持禁用，不做挑战/登录/付费绕过。
- `LN_BILINOVEL_SEARCH_URL` 只是给运营者的显式接口，**不代表**关键词搜索已可用；
  配置前必须自行确认该端点遵守 robots.txt 且确实返回关键词结果。

## 7. 实测结果（2026-11-12，飞牛 NAS 容器 linux/amd64）

**`RESULT 19/19 checks passed (LIVE www.bilinovel.net)`**，全程无凭据、遵守 robots、限速，
仅抓取 1 本书 / 1 卷。关键结果：

| 环节 | 实测结果 |
|------|----------|
| `novel_details`（真实 HTTP GET） | 标题 `安达与岛村`、作者 `入间人间`、出版社 `电击文库`、7 个标签、114 字简介、canonical URL `https://www.bilinovel.net/novel/2059.html` |
| `novel_volumes`（真实目录页） | 18 卷 / 215 章，第 1 卷 `安达与岛村 1` 共 7 章，章节 URL 为站点公开地址 |
| `novel_search` | `total=0`、`degradedSources=["bilinovel"]`：未发请求、未伪造命中 |
| `novel_download` | 最终回归 `task_c3fefd9124704619` → `state=completed`，真实下载 7 章（首轮为 `task_4abb9b5cbdc24bc6`） |
| EPUB | `1,988,804` B，ZIP magic `50 4b 03 04`，29 个条目（8 个 XHTML / 16 张插图），XHTML 含 `105,469` 字符中文正文，`integrity: ok` |
| sha256 | 首轮 `9300fc07b241ac23b6c20132b9901cddca7cb2ec608f1f395dbd3db84fe118ac`，最终回归 `ba76876b0812…`。**每次打包的哈希不同**：ZIP 条目带生成时间，属预期；`.sha256` 旁路文件记录当次实际哈希，`verify` 以文件实时重算比对，仍可证明完整性 |
| `novel_library` | 最终隔离回归 `entries=1`、`verify` 全库复验通过；Dart 核心 `/opt/bnp/bnp_headless` 可用 |

落盘证据（NAS 宿主机，最终隔离回归）：

```text
/home/chatgpt/dsh-plugin-lightnovel-data/live-verify-final/library/安达与岛村/安达与岛村 1.epub        1988804 B
/home/chatgpt/dsh-plugin-lightnovel-data/live-verify-final/library/安达与岛村/安达与岛村 1.epub.sha256
/home/chatgpt/dsh-plugin-lightnovel-data/live-verify-final/library/index.json                      entries=1, integrity: ok
/home/chatgpt/dsh-plugin-lightnovel-data/live-verify-final/logs/bili_novel.log                   6957 B  ← 修复后日志固定在此
/home/chatgpt/dsh-plugin-lightnovel-data/live-verify-final/tasks/task_c3fefd9124704619.json
/home/chatgpt/dsh-ln-live-verify-final.log                                                      最终 19/19 结果归档
```

> 首轮运行时脚本尚未显式设置 `libraryDir`，镜像 ENV `LN_LIBRARY_DIR=/data/library`
> 生效，EPUB 落在共享书库。后续回归已把 `libraryDir` 固定到
> `<LN_LIVE_DATA_DIR>/library`，共享书库 `/data/library` 在最终回归前后均为 2 条
> 且全部 `ok`，**未被验证数据污染**。上游 `bili_novel.log` 只出现在隔离的 `logs/`。

### 最终一致性回归（同一最终镜像 `sha256:93038c97…`）

| 验证 | 命令 | 结果 |
|------|------|------|
| 离线 fixture 闭环 | `docker compose --profile verify run --rm verify` | `RESULT 13/13 checks passed on linux/x64`，`novel_library entries=1`，数据落在 `/data/nas-verify/` |
| 在线真实抓取闭环 | `docker run … --entrypoint node … scripts/verify-live.mjs`（`LN_LIVE_DATA_DIR=/data/live-verify-final`） | `RESULT 19/19 checks passed (LIVE www.bilinovel.net)`，数据落在 `/data/live-verify-final/` |
| 镜像构建 | `docker compose --progress plain build` | `BUILD_EXIT=0`，镜像 ID `93038c9740ce` |

本地回归：TypeScript `88/88` 测试通过、`tsc --noEmit` 通过、Dart 端到端
`ALL_OK`、`npm pack --dry-run` 160 文件（含两个验证脚本）。历史重复索引自愈亦在 NAS
上实测：一条 `failed` 陈旧记录被自动清除，索引由 3 条 → 2 条、全部 `ok`。

# dsh-plugin-lightnovel

DeepSeek Harness (Cordis) 原生插件：让 AI Agent 自主**搜索轻小说 → 查看详情 → 选择分卷 → 下载 EPUB**。

基于原项目 [montaro2017/bili_novel_packer](https://github.com/montaro2017/bili_novel_packer)（Dart CLI）开发，**保留其采集、正文恢复、插图嵌入与 EPUB 打包能力**，仅在外围增加非交互接口、进度/取消钩子和工具层。

> 设计原则：**只复用、不重写**。Dart 的 `LightNovelSource` / `NovelPacker` / `EpubPacker` 原样 vendored；TypeScript 侧只做搜索聚合、任务编排、持久化与 DSH 工具注册。

---

## 能力

| 工具 | 作用 |
|------|------|
| `novel_search` | 多书源关键词检索，支持书名 / 别名 / 作者 / 标签，繁简体匹配，结构化结果与相关度排序 |
| `novel_details` | 通过原 Dart 采集器获取书籍完整元数据并合并本地索引 |
| `novel_volumes` | 列出全部分卷与章节（1-based 索引、卷名、章节数、章节 URL） |
| `novel_download` | 后台任务方式下载 EPUB，返回 `taskId`，支持 `combine` 合卷 |
| `novel_tasks` | 进度查询 / 取消 / 失败重试 / 任务列表 / 结构化日志 / 运行诊断 |
| `novel_library` | 已下载 EPUB 库：列表、详情、校验、sha256、删除（需确认） |

闭环示例（工具返回值均为 lossless JSON）：

```
novel_search  {query:"月下的茶館"}      → results[0].id = "fixture:moon-teahouse"
novel_details {bookId:"..."}            → title/author/cover/description/status/volumes
novel_volumes {bookId:"..."}            → volumes[{index:1,name:"第一卷 启程",chapters:[...]}]
novel_download{bookId:"...",volumes:"1"}→ {ok:true, taskId:"task_..."}
novel_tasks   {action:"get",taskId:"…"} → state/percent/downloadedChapters/artifacts[sha256,integrity]
novel_library {action:"list"}           → entries[{relativePath, absolutePath, sha256, integrity}]
```

---

## 安装

前置：Node **>= 24.9.0**、DSH **0.2.2-rc.1**（`engines` 会校验）。下载 EPUB 还需 Dart SDK >= 3.11 或已编译的 `bnp_headless`。

### 方式 A：npm / tarball（推荐，含预构建产物）

```bash
dsh plugin --profile myprofile add dsh-plugin-lightnovel
# 或从本地打包产物
npm pack                     # 生成 dsh-plugin-lightnovel-1.0.0.tgz
dsh plugin --profile myprofile add ./dsh-plugin-lightnovel-1.0.0.tgz
```

### 方式 B：从 git 源码安装

```bash
dsh plugin --profile myprofile add github:xieqiong111/dsh-plugin-lightnovel
```

git 安装拉取的是源码，pnpm ≥10 会拒绝运行 `prepare` 构建脚本。按 `dsh` 提示把包键写入该 profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  dsh-plugin-lightnovel: true
```

然后重新 `add`。`prepare` 脚本在 `dist/` 缺失时会自行编译 TypeScript。

### 编译 Dart 核心（下载功能必需）

```bash
cd vendor/bili_novel_packer
dart pub get
dart compile exe bin/headless.dart -o build/bnp_headless
```

或设置 `LN_DART_BINARY=/opt/bnp/bnp_headless`（Docker 镜像已内置到该路径，会自动探测）。也可以设置 `LN_DART_SDK` 让插件走 `dart run bin/headless.dart`。

### 验证安装（不需要 LLM key）

```bash
dsh --profile myprofile --dump-config | grep -A 20 "== dsh-plugin-lightnovel"
```

应能看到 `id: lightnovel` 行及全部配置项。

---

## Web 前端（交互原型）

仓库内 [`web/`](./web) 是一套独立的 React + TypeScript + Vite + Tailwind 前端，按设计稿还原「轻小说管理中心」工作台，覆盖 Dashboard、搜索发现、小说详情、下载任务、我的书库、书源状态、自动追更、统计分析、系统设置九个页面。

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物在 web/dist/
```

- 视觉还原与逐区域对比：[web/docs/COMPARISON.md](./web/docs/COMPARISON.md)、[web/docs/screenshots](./web/docs/screenshots)
- 功能清单、Mock 边界、真实接口接入方式：[web/README.md](./web/README.md)
- 前端数据层为独立 Mock（`web/src/services/novelApi.ts`，`API_MODE='mock'`），界面统一标注「交互原型 · 非真实数据」；`docs/API-CONTRACT.md` 中的 `/api/*` 仍是计划接口，插件后端与 Dart 核心未做修改。

---

## 配置

所有配置都可在 profile 的 `cordis.patch.yml` 中按 `id: lightnovel` 覆盖整行 `config`（patch 层是按行替换，不是深合并）。默认层见 [`cordis.patch.yml`](./cordis.patch.yml)，对应环境变量如下：

| 配置项 | 环境变量 | 默认 | 说明 |
|--------|----------|------|------|
| `dataDir` | `LN_DATA_DIR` | `~/.local/share/dsh-plugin-lightnovel` | 任务/索引/日志根目录 |
| `libraryDir` | `LN_LIBRARY_DIR` | `<dataDir>/library` | EPUB 库目录 |
| `dartBinary` | `LN_DART_BINARY` | 自动探测 | 编译后的 `bnp_headless` |
| `dartProjectDir` | `LN_DART_PROJECT_DIR` | 包内 `vendor/bili_novel_packer` | Dart 工程根 |
| `fixturesDir` | `LN_FIXTURES_DIR` | 包内 `test/fixtures` | 离线书源数据 |
| `enabledSources` | `LN_ENABLED_SOURCES` | `bilinovel,fixture` | 启用的书源 id |
| `requestIntervalMs` | `LN_REQUEST_INTERVAL_MS` | `4000` | 同主机最小请求间隔 |
| `searchTimeoutMs` | — | `15000` | 检索/详情超时 |
| `taskTimeoutMs` | — | `3600000` | 单任务超时 |
| `maxConcurrentDownloads` | `LN_MAX_CONCURRENT_DOWNLOADS` | `1` | 并发下载数 |
| `maxRetries` | `LN_MAX_RETRIES` | `2` | 任务重试上限 |
| `maxVolumesPerTask` | — | `50` | 单任务最大卷数 |
| `respectRobots` | `LN_RESPECT_ROBOTS` | `true` | 遵守 robots.txt 与 Crawl-delay |
| `offlineOnly` | `LN_OFFLINE_ONLY` | `false` | 仅离线 fixture 书源 |
| `allowNonPublicSources` | — | `false` | 允许可能需登录的书源（仍不提供凭据） |
| `searchMode` | — | `hybrid` | `live` / `local` / `hybrid` |
| `userAgent` | — | 含插件标识 | 礼貌 UA |
| `logLevel` | `LN_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `extraTraditionalMap` | — | `""` | 额外繁简对，如 `臺台,裡里` |
| — | `LN_BILINOVEL_SEARCH_URL` | 不设置 | 显式 opt-in 的在线搜索端点模板（`{q}` 为关键词）；默认不发起 live 搜索，见下文 |

完整说明见 [`docs/CONFIG.md`](./docs/CONFIG.md)。

### 在线书源与真实抓取验证

`bilinovel` 的详情、目录、正文、插图与 EPUB 下载均走**公开页面真实抓取**（由内置 Dart
核心完成），默认域名为实测可达的 `www.bilinovel.net`。但该站点没有 robots 允许的公开
GET 关键词搜索端点，因此 live 搜索默认不请求、不伪造命中，`novel_search` 会把
`bilinovel` 记入 `degradedSources`；可直接把公开详情 URL 交给 `novel_details` /
`novel_volumes` / `novel_download`。`wenku8` 为受限书源，默认禁用且不绕过登录/付费/Cloudflare。

可复现的真实网络验证脚本为 [`scripts/verify-live.mjs`](./scripts/verify-live.mjs)，
完整预检证据、合规边界与修复记录见 [`docs/LIVE-SOURCES.md`](./docs/LIVE-SOURCES.md)。

---

## 飞牛 NAS / Docker Compose（Linux x86-64）

```bash
cp .env.example .env      # 把 LN_DATA_DIR 改成 NAS 共享文件夹绝对路径
docker compose up -d --build
docker compose logs -f    # 输出组合后的 DSH 配置，验证安装
docker compose exec lightnovel dsh --profile nas --dump-config
```

镜像为 `linux/amd64`，内置 Node 24、DSH CLI 与编译好的 Dart `bnp_headless`。所有状态落在挂载的 `/data`。无外网时设 `LN_OFFLINE_ONLY=true`，仅使用内置离线书源运行完整闭环。详见 [`docs/DEPLOY-NAS.md`](./docs/DEPLOY-NAS.md)。

---

## 测试

```bash
npm install
npm run build            # TypeScript -> dist/
npm run test:unit        # 71 个单元测试（含在线书源、Dart bridge、书库去重回归）
npm run test:integration # 真实 DSH 运行时加载 + 六工具调用 + CLI 组合
npm run test:dart        # 编译 Dart 核心并端到端生成 EPUB
npm test                 # 全部 88 项 vitest
```

`test:integration` **不是模拟**：它启动真实的 Cordis `Context`，挂载真实的 `ToolsService` / `SystemPrompt` / NativeToolExecutor，把 `dist/index.js` 通过 `ctx.plugin()` 载入，再经 `ctx.tools.execute()` 派发调用，走完完整闭环并校验生成的 EPUB。另一组测试调用真实 `dsh --dump-config` 验证 bundle 组合层。

测试全部离线（`fixture` 书源 + 本地 PNG + 编译好的 Dart 核心），不访问任何第三方站点。

---

## 合规与边界

- 仅访问公开页面；`robots.txt` 与 `Crawl-delay` 生效，同主机最小间隔限速，重定向逐跳重新校验。
- 请求显式 `credentials: 'omit'`，不携带/存储 Cookie 或 Authorization，**不绕过登录、付费或访问控制**。
- SSRF 防护：拒绝私网、环回、链路本地、云元数据地址、非标准端口、内嵌凭据与非 HTTP(S) 协议；书源域名白名单。
- 路径安全：所有库路径为相对路径并经 `safeResolve` 证明未越出根目录；任务 id、书名均做消毒。
- `wenku8` 等受限书源默认禁用；即使开启也不会提供任何会话凭据。

---

## 目录结构

```
src/                     TypeScript 插件（工具、任务、持久化、搜索、合规、日志）
vendor/bili_novel_packer/ 原 Dart 项目（仅加性补丁：headless.dart / hooks / fixture_source / console sink）
test/fixtures/           离线书源数据（books.json / novel.json / catalog.json / 章节 / 图片）
test/unit/               单元测试
test/integration/        真实 DSH 运行时与 CLI 集成测试
docker/ docker-compose.yml Dockerfile   飞牛 NAS 部署
docs/                    配置与部署文档
```

## License

MIT（本插件）；vendored 原项目许可见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) 与 `vendor/bili_novel_packer/LICENSE`。

> 后续规划（闭环稳定后再做）：AI 自动追更、更多书源适配、可视化管理界面。当前版本刻意不包含这些，以确保「搜索 → 详情 → 卷数 → EPUB」闭环稳定。

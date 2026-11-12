# 飞牛 NAS（FnOS）部署指南 · Linux x86-64

镜像固定 `linux/amd64`，适用于飞牛 NAS 及绝大多数 x86-64 家用 NAS / 小主机。ARM 机型需自行把 `Dockerfile` 的平台参数与 Dart SDK 包改为 `linux-arm64`。

## 1. 准备目录

在飞牛 NAS 上建一个共享文件夹，例如 `/vol1/1000/lightnovel`，并确认其所有者 uid:gid（一般是 `1000:1000`）：

```bash
mkdir -p /vol1/1000/lightnovel/{library,tasks,logs,index,dsh-home}
```

容器会把这个目录挂载到 `/data`。目录布局：

```
/vol1/1000/lightnovel/
├── library/          # 最终 EPUB（可在 SMB 中直接看到）
│   ├── index.json
│   ├── 星海旅途/
│   │   ├── 星海旅途 第一卷 启程.epub
│   │   └── 星海旅途 第一卷 启程.epub.sha256
├── tasks/            # 任务状态与工作目录
├── logs/             # plugin-YYYY-MM-DD.log (JSONL)
├── index/            # books.json 本地检索索引
└── dsh-home/         # DSH_HOME，profile 与 bundle 链接
```

## 2. 配置

```bash
cp .env.example .env
```

至少修改：

```dotenv
LN_DATA_DIR=/vol1/1000/lightnovel
LN_UID=1001
LN_GID=1001
```

> **`LN_UID` / `LN_GID` 必须用宿主机真实值**：先执行 `id -u` / `id -g`。
> 本次部署的飞牛 NAS 上 `chatgpt` 实际是 `1001:1001`（不是常见的 1000）。
> 写错会导致插件 `mkdir` 报 `EACCES`，以及 Dart 核心无法写日志（见排障表）。

无外网 / 不想访问第三方站点时：

```dotenv
LN_OFFLINE_ONLY=true
LN_ENABLED_SOURCES=fixture
```

需要运行真实 Agent（非 `--dump-config` 验证）时再按需提供 LLM 凭据：

```dotenv
DEEPSEEK_API_KEY=sk-...
```

## 3. 构建与启动

```bash
docker compose build               # 首次约数分钟：下载 Dart SDK + 编译 bnp_headless + npm ci
docker compose up -d
docker compose logs -f
```

### 真实闭环验证（推荐）

`--dump-config` 只证明 bundle 被 DSH CLI 接受。要证明插件在 NAS 上**真的能加载并调用**，运行内置的验证服务：它会在容器内启动真实 Cordis + ToolsService，加载 `dist/index.js`，经 `ctx.tools.execute()` 依次调用六个工具，走完搜索→详情→卷数→下载→任务→书库的完整闭环，并校验生成的 EPUB（全部走离线 fixture，无需 LLM key / 外网）：

```bash
docker compose --profile verify run --rm verify
```

预期输出 13 项 `PASS`，末行 `RESULT 13/13 checks passed on linux/x64`。

验证是**隔离**的：脚本显式把 `dataDir` / `libraryDir` 固定在 `<LN_DATA_DIR>/nas-verify/` 下，不读取也不覆盖运营者真实的 `/data/library` 书库（镜像 ENV `LN_LIBRARY_DIR` 不会生效）。在线抓取验证脚本同理，库目录固定在 `<LN_LIVE_DATA_DIR>/library`。

### 中国大陆网络 / 代理注意事项

- 若本机 DNS 被透明代理劫持，域名可能解析到 `198.18.x.x`（RFC 2544 保留段）的 fake-IP，表现为「所有端口都能连上但没有任何数据」。用 `dig @223.5.5.5 A <域名>` 取真实地址；若只有 IPv6 可达，直接用 `ssh -6 -i <key> user@<IPv6字面量>` 连接（不要走系统 HTTP 代理）。
- 构建默认使用已缓存的国内镜像源，可在 `.env` 用 `NODE_BASE` / `DEBIAN_BASE` / `PUB_HOSTED_URL` 覆盖。
- Dart SDK 从 `storage.googleapis.com` 下载（约 228 MB），构建已使用 host 网络 + `--noproxy '*'` 直连，并把超时放宽到 3600 秒。双栈主机上 IPv4 / IPv6 的速率可能相差近 10 倍，先测速再决定：

  ```bash
  URL=https://storage.googleapis.com/dart-archive/channels/stable/release/3.13.7/sdk/dartsdk-linux-x64-release.zip
  curl --noproxy '*' -4 -r 0-10485759 -o /dev/null -w '%{speed_download} B/s\n' "$URL"
  curl --noproxy '*' -6 -r 0-10485759 -o /dev/null -w '%{speed_download} B/s\n' "$URL"
  ```

  在 `.env` 设置 `DART_CURL_OPTS=-6`（或 `-4`）即可让构建强制走较快的路径；例如某次飞牛 NAS 实测 IPv4 约 180 KB/s、IPv6 约 1.1 MB/s。

- 如果构建容器内的**单条连接**仍被限速（宿主机直连很快、容器内却只有几十 KB/s，常见于双栈/CDN 边缘节点差异），可在宿主机预下载 SDK 并放进构建上下文，构建时会自动改用本地文件、完全跳过容器内下载：

  ```bash
  mkdir -p build-assets
  curl --noproxy '*' -6 -fsSL --retry 3 \
    -o build-assets/dartsdk-linux-x64-release.zip \
    https://storage.googleapis.com/dart-archive/channels/stable/release/3.13.7/sdk/dartsdk-linux-x64-release.zip
  unzip -tq build-assets/dartsdk-linux-x64-release.zip   # 校验完整性
  docker compose build
  ```

  也可分段并行下载后按序 `cat part.* > dartsdk-linux-x64-release.zip` 拼接。该 zip 已被 `.gitignore` 排除，不要提交仓库或打进 npm 包。

`command` 默认为 `["--profile","nas","--dump-config"]`，容器会打印组合后的 DSH 配置后退出 Compose 的常规前台日志；这是**安装自检**：

```
# == @deepseek-ai/dsh-base
...
# == dsh-plugin-lightnovel
- id: lightnovel
  name: dsh-plugin-lightnovel
  config:
    dataDir: ...
```

看到 `# == dsh-plugin-lightnovel` 即说明 bundle 已被真实 DSH CLI 接受。

> 若希望容器常驻，在 `docker-compose.yml` 中把 `command` 改为
> `["--profile","nas","web"]`（Web UI，端口 `LN_WEB_PORT`），
> 或用 `docker compose run --rm lightnovel --profile nas headless "你的任务"` 单次执行。

## 4. 验证 Dart 核心

```bash
docker compose run --rm --entrypoint /bin/sh lightnovel -c \
  '/opt/bnp/bnp_headless details --source fixture \
   --url fixture://novel/star-voyage.html \
   --fixtures /opt/lightnovel/test/fixtures --allowed-sources fixture'
```

应输出 `{"type":"result", ... "data":{"novel":{...}}}`。

## 5. 运行一次完整闭环（离线）

```bash
docker compose run --rm --entrypoint /opt/bnp/bnp_headless lightnovel \
  pack --source fixture \
  --url fixture://novel/star-voyage.html \
  --fixtures /opt/lightnovel/test/fixtures \
  --allowed-sources fixture \
  --output-dir /data/tasks/smoke \
  --volumes 1 --combine false --add-chapter-title true
```

生成的 EPUB 应出现在 `/data/tasks/smoke/星海旅途/`。

## 6. 换成自己的书源

`fixture` 书源是结构化 JSON，可直接改成自己的离线数据；挂载覆盖即可（只读）：

```yaml
volumes:
  - "${LN_DATA_DIR}:/data"
  - ./my-fixtures:/opt/lightnovel/test/fixtures:ro
```

`my-fixtures/` 需包含：

| 文件 | 用途 |
|------|------|
| `books.json` | 搜索结果（`id/bookId/sourceUrl/title/aliases/author/coverUrl/description/tags/publisher/statusText/status/volumeCount`） |
| `novel.json` | Dart `getNovel` 的书籍元数据 |
| `catalog.json` | 分卷列表，每项含 `name`、`cover`、`chapters[{name,file}]` |
| `chapters/*.html` | 章节正文片段 |
| `images/*` | 封面与内文插图（PNG/JPEG/GIF） |

在线书源的可达性、robots 规则与真实抓取验证详见 [`docs/LIVE-SOURCES.md`](./LIVE-SOURCES.md)。
重点：实测 `www.bilinovel.com` 不可达，插件默认使用 `www.bilinovel.net`；该站点没有
robots 允许的公开 GET 关键词搜索端点，因此 `bilinovel` 的 live 搜索默认**不发起请求**
（`degradedSources` 中如实标注），只有显式设置 `LN_BILINOVEL_SEARCH_URL` 时才抓取。
`LN_WENKU8_SEARCH_URL` 仅在受限书源被显式启用时生效（默认禁用，且实测 Cloudflare 403）。

复现真实在线闭环（只用公开页面、遵守 robots 与限速、默认仅下载 1 卷）：

```bash
docker run --rm --network dsh-lightnovel-net --user "$(id -u):$(id -g)" \
  -v "$LN_DATA_DIR:/data" -e LN_LIVE_DATA_DIR=/data/live-verify \
  --entrypoint node dsh-plugin-lightnovel:1.0.0 \
  /opt/lightnovel/scripts/verify-live.mjs
# 只读预检（不下载）：额外加 -e LN_LIVE_ALLOW_DOWNLOAD=0
```

## 7. 运维

```bash
docker compose logs --tail=200 lightnovel          # 结构化日志
docker compose exec lightnovel sh -c 'tail -f /data/logs/plugin-*.log'
docker compose restart lightnovel                  # 未完成任务自动标记 interrupted
docker compose down && docker compose up -d --build  # 升级
```

- **备份**：只需备份宿主机 `/vol1/1000/lightnovel`（含 library + 任务状态）。
- **权限**：若 SMB 中看不到 EPUB 或出现 `EACCES`，用 `id -u` / `id -g` 核对 `LN_UID`/`LN_GID` 与共享文件夹所有者。
- **限速**：默认同主机 4 秒一次，请勿调低；`LN_RESPECT_ROBOTS` 保持 `true`。
- **Dart 日志**：上游核心日志固定在 `<dataDir>/logs/bili_novel.log`（由 bridge 注入的 `BNP_LOG_FILE` 绝对路径指定），不会污染 vendor 目录或 EPUB 书库。
- **完整性**：把 `index.json` 与 `.sha256` 一起备份，可用 `sha256sum -c` 校验。

## 8. 排障

| 现象 | 原因 / 处理 |
|------|-------------|
| `novel_tasks.status` 显示 `dart.available: false` | `LN_DART_BINARY` 路径错误；镜像内应为 `/opt/bnp/bnp_headless` |
| 下载任务 `DART_UNAVAILABLE` | 同上，或 Dart SDK 未安装 |
| `EACCES: permission denied, mkdir '/data/...'` | `LN_UID`/`LN_GID` 与宿主机目录 owner 不一致；用 `id -u` / `id -g` 校正后重建容器 |
| `DART_EXIT ... exited with code 255` / `PathAccessException: Cannot open file, path = 'bili_novel.log'` | 旧版本把 Dart 进程 cwd 设为只读 vendor 目录，真实网络请求触发上游日志写文件即崩溃（离线 fixture 不会触发）。升级到含 `BNP_LOG_FILE` 修复的镜像；确保 `<dataDir>/logs` 可写 |
| `SOURCE_DISABLED` | 书源未写入 `LN_ENABLED_SOURCES`，或受限书源被策略禁用 |
| `novel_search` 无在线结果且 `degradedSources` 含 `bilinovel` | 符合预期：目标站点没有 robots 允许的公开 GET 关键词搜索端点，插件不伪造命中。可直接用公开详情 URL 调 `novel_details` / `novel_download`，或显式配置 `LN_BILINOVEL_SEARCH_URL` |
| `RESTRICTED_SOURCE` | 目标书源可能需要登录；插件按设计拒绝，不提供凭据 |
| `robots.txt disallows ...` | 站点规则禁止；请尊重该规则，不要关闭 `respectRobots` 绕过 |
| EPUB `integrity: failed` | 查看 `novel_tasks get` 的 `integrityError` 与日志；可 `retry` 任务 |
| `novel_library {action:"verify"}` 全库复验失败，但 EPUB 文件本身完好 | 旧版本重复下载同一卷会留下指向同一路径、sha256 已过期的重复索引条目。升级到含书库去重修复的版本后，`load()` 会自动去重并写 `deduplicated_index` 日志；也可 `novel_library {action:"remove", id:"<旧条目id>"}` 手工清理 |
| 容器启动即退出 | 默认 `--dump-config` 是自检命令，属正常；常驻请改 `command` |
| `failed to create network ... all predefined address pools have been fully subnetted` | NAS 上已有大量 Docker 网络，默认地址池用尽。先手工建一个显式网段的用户自定义网络，再用 `docker-compose.override.yml` 复用它（不要复用内置 `bridge`，Compose 会给它加 network-scoped alias 而报错）：<br>`docker network create --driver bridge --subnet 10.99.77.0/24 --gateway 10.99.77.1 dsh-lightnovel-net`<br>然后写入 `docker-compose.override.yml`：`networks: { default: { name: dsh-lightnovel-net, external: true } }` |
| 构建卡在 Dart SDK 下载 / `curl: (28) Operation timed out` | 见第 3 节的 IP 族测速与 `build-assets/` 预下载方案 |
| `dart compile exe` 报 `PathNotFoundException: /opt/bnp/bnp_headless` | `dart compile exe` 不会自动创建 `-o` 的父目录；Dockerfile 已加 `mkdir -p /opt/bnp`，自定义构建时请保留 |

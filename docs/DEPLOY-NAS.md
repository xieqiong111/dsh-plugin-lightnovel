# 飞牛 NAS（FnOS）部署指南 · Linux x86-64

镜像固定 `linux/amd64`，适用于飞牛 NAS 及绝大多数 x86-64 家用 NAS / 小主机。ARM 机型需自行把 `Dockerfile` 的平台参数与 Dart SDK 包改为 `linux-arm64`。

## 1. 准备目录

在飞牛 NAS 上建一个共享文件夹（下称 `$LN_DATA_DIR`），并确认其所有者 uid:gid：

```bash
mkdir -p "$LN_DATA_DIR"/{library,tasks,logs,index,dsh-home}
```

容器会把这个目录挂载到 `/data`。目录布局：

```
$LN_DATA_DIR/
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
LN_DATA_DIR=/path/to/lightnovel
LN_UID=<uid>
LN_GID=<gid>
```

> **`LN_UID` / `LN_GID` 必须用宿主机真实值**：先执行 `id -u` / `id -g`。
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

## 4. Web 管理台（BFF + Live 前端）

漫画服务的 Compose 启动方式与环境变量见 [Suwayomi 漫画集成](./MANGA.md)。

除了 DSH Agent，本仓库还提供一个**单进程 Web 管理台**：`server/serve.mjs` 同时托管 `web/dist` 静态页面与 `/api/*`，直接调用插件的 `PluginRuntime`。它不启动 DSH CLI、不调用 LLM，因此不消耗 API key，也不影响 Agent 侧配置。

- 默认端口：宿主机 `5273` → 容器 `8080`
- 默认地址：`http://<NAS 地址>:5273/`
- 前端构建模式：`VITE_API_MODE=live`（数据来自 BFF，不再注入 Mock）
- 容器基础镜像：`node:24-bookworm-slim`（**不要用 Alpine**：预编译 Dart AOT 依赖 glibc，musl 上无法执行；已有完整镜像时可用 `dsh-plugin-lightnovel:1.0.0`）
- 运行用户与数据目录 owner 一致（建议 `1001:1001`，以 `id -u` / `id -g` 为准）
- 只读挂载代码与构建产物；只有 `$LN_DATA_DIR` 可写
- 复用外部网络 `dsh-lightnovel-net`，避免 NAS 上 Docker 地址池耗尽

### 4.1 主机目录

建议单独一个目录（下称 `$LN_WEB_DIR`），不要覆盖旧静态部署：

```text
$LN_WEB_DIR/
├── server/                 # BFF（只读挂载）
├── dist/                   # 插件编译产物（只读）
├── node_modules/           # 运行时依赖（只读；cheerio / opencc-js）
├── package.json            # ESM 类型声明（只读）
├── vendor/                 # Dart 源码与 fixture 依赖（只读）
├── test/fixtures/          # 离线书源（只读）
├── web/dist/               # Live 前端产物（只读）
├── bnp_headless            # linux/amd64 Dart 可执行文件（只读）
├── docker-compose.web.yml
└── data/                   # 可写：library / tasks / logs / index
```

### 4.2 准备构建产物

在开发机（Node 24 + Dart）上：

```bash
npm ci
npm run build                         # 插件 TypeScript -> dist/
cd web && VITE_API_MODE=live npm run build && cd ..
```

把 `server/`、`dist/`、`package.json`、`vendor/`、`test/fixtures/`、`web/dist/` 与 `docker-compose.web.yml` 同步到 `$LN_WEB_DIR`。`node_modules/` 与 `bnp_headless` 建议直接复用已有的插件镜像，避免在 NAS 上重新编译 Dart：

```bash
docker create --name ln-web-deps dsh-plugin-lightnovel:1.0.0
docker cp ln-web-deps:/opt/lightnovel/node_modules "$LN_WEB_DIR/"
docker cp ln-web-deps:/opt/bnp/bnp_headless "$LN_WEB_DIR/"
docker rm ln-web-deps
```

若没有该镜像，也可以构建根目录的 `Dockerfile`（会编译 linux/amd64 的 `bnp_headless`），或在 Node 24 容器内执行 `npm ci --omit=dev` 生成 `node_modules`。

### 4.3 配置与启动

在 `$LN_WEB_DIR/.env`：

```dotenv
LN_DATA_DIR=/path/to/lightnovel-web-data
LN_UID=<id -u 的结果>
LN_GID=<id -g 的结果>
LN_WEB_PORT=5273
LN_WEB_IMAGE=node:24-bookworm-slim
# 或复用已构建的完整镜像（自带 Node + Dart）：
# LN_WEB_IMAGE=dsh-plugin-lightnovel:1.0.0
LN_WEB_NETWORK=dsh-lightnovel-net

# 只读/离线部署建议：
LN_ENABLED_SOURCES=fixture
LN_OFFLINE_ONLY=true

# 需要公网书源时改为：
# LN_ENABLED_SOURCES=bilinovel,fixture
# LN_OFFLINE_ONLY=false

# 可选：启用 API token（强烈建议对局域网开放时设置）
# LN_BFF_TOKEN=<openssl rand -hex 24>

# 可选：允许删除书库文件；默认 false
# LN_BFF_ALLOW_DELETE=true
```

创建网络并启动：

```bash
docker network inspect dsh-lightnovel-net >/dev/null 2>&1   || docker network create --driver bridge --subnet 10.99.77.0/24        --gateway 10.99.77.1 dsh-lightnovel-net

cd "$LN_WEB_DIR"
docker compose -f docker-compose.web.yml up -d
docker compose -f docker-compose.web.yml ps
```

如果 5273 已被旧的纯静态容器占用，先停掉并改名保留回滚，不要直接删除：

```bash
docker stop lightnovel-studio-web
docker rename lightnovel-studio-web lightnovel-studio-web-static-old
```

### 4.4 验证

```bash
curl -s http://127.0.0.1:5273/api/health
# {"ok":true,"dart":true,...}

curl -s http://127.0.0.1:5273/api/status
# 应包含 "apiMode":"live"，dart.runner 只有 basename（不泄漏绝对路径）

curl -sI http://127.0.0.1:5273/ | head -1
# HTTP/1.1 200 OK，Content-Type: text/html
```

浏览器打开 `http://<NAS 地址>:5273/`：

- 顶栏显示「实时数据」，不再显示 Mock 胶囊；
- 首页只展示已正式写入书库的 EPUB（`GET /api/library`）；未入库书目仅在用户显式输入关键词搜索后出现；
- 搜索「星海」应命中「星海旅途」；
- 详情 → 选卷 → 创建任务 → 任务页出现真实进度 → 书库出现 EPUB；
- 书源页显示真实 registry，延迟/成功率为不可用而不是假数字。

若启用了 `LN_BFF_TOKEN`，在「系统设置」填入同一 token；未填时所有 `/api/*` 返回 401，页面会显示错误提示。容器 healthcheck 会自动带上该 token。

### 4.5 升级与回滚

```bash
# 前端更新
cd web && VITE_API_MODE=live npm run build && cd ..
docker compose -f docker-compose.web.yml restart web

# BFF 更新（server/ 或 dist/）
docker compose -f docker-compose.web.yml restart web

# 回滚到旧静态版
docker stop lightnovel-studio-web
docker rename lightnovel-studio-web lightnovel-studio-web-live-bak
docker rename lightnovel-studio-web-static-old lightnovel-studio-web
docker start lightnovel-studio-web
```

日志：

```bash
docker logs -f lightnovel-studio-web
docker exec lightnovel-studio-web sh -c 'ls -l /data/logs'
```

### 4.6 端到端验证脚本

在开发机仓库根运行：

```bash
npm run verify:web
```

它会用随机端口 + 临时数据目录启动一个隔离 BFF，覆盖 health、status、精选、搜索、详情、分卷、建任务、轮询、书库、EPUB ZIP/mimetype、sha256 sidecar、verify、404/405/400/413、静态托管、SPA fallback、token 与 DELETE，共 49 项断言。需要 Node 24 与 Dart；`LN_DART_SDK` / `PUB_CACHE` 未设置时会按本机默认探测。

## 5. 验证 Dart 核心

```bash
docker compose run --rm --entrypoint /bin/sh lightnovel -c \
  '/opt/bnp/bnp_headless details --source fixture \
   --url fixture://novel/star-voyage.html \
   --fixtures /opt/lightnovel/test/fixtures --allowed-sources fixture'
```

应输出 `{"type":"result", ... "data":{"novel":{...}}}`。

## 6. 运行一次完整闭环（离线）

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

## 7. 换成自己的书源

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

## 8. 运维

```bash
docker compose logs --tail=200 lightnovel          # 结构化日志
docker compose exec lightnovel sh -c 'tail -f /data/logs/plugin-*.log'
docker compose restart lightnovel                  # 未完成任务自动标记 interrupted
docker compose down && docker compose up -d --build  # 升级
```

- **备份**：只需备份宿主机 `$LN_DATA_DIR`（含 library + 任务状态）。
- **权限**：若 SMB 中看不到 EPUB 或出现 `EACCES`，用 `id -u` / `id -g` 核对 `LN_UID`/`LN_GID` 与共享文件夹所有者。
- **限速**：默认同主机 4 秒一次，请勿调低；`LN_RESPECT_ROBOTS` 保持 `true`。
- **Dart 日志**：上游核心日志固定在 `<dataDir>/logs/bili_novel.log`（由 bridge 注入的 `BNP_LOG_FILE` 绝对路径指定），不会污染 vendor 目录或 EPUB 书库。
- **完整性**：把 `index.json` 与 `.sha256` 一起备份，可用 `sha256sum -c` 校验。

## 9. 排障

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

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
LN_UID=1000
LN_GID=1000
```

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

预期输出 16 项 `PASS`，末行 `RESULT 16/16 checks passed on linux/x64`。

### 中国大陆网络 / 代理注意事项

- 若本机 DNS 被透明代理劫持，域名可能解析到 `198.18.x.x`（RFC 2544 保留段）的 fake-IP，表现为「所有端口都能连上但没有任何数据」。用 `dig @223.5.5.5 A <域名>` 取真实地址；若只有 IPv6 可达，直接用 `ssh -6 -i <key> user@<IPv6字面量>` 连接（不要走系统 HTTP 代理）。
- 构建默认使用已缓存的国内镜像源，可在 `.env` 用 `NODE_BASE` / `DEBIAN_BASE` / `PUB_HOSTED_URL` 覆盖。
- Dart SDK 从 `storage.googleapis.com` 下载；不可达时改用镜像并调整 `Dockerfile` 中的 URL。

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

在线书源的检索 URL 可用 `LN_BILINOVEL_SEARCH_URL` / `LN_WENKU8_SEARCH_URL` 覆盖模板（`{q}` 为关键词占位符）。

## 7. 运维

```bash
docker compose logs --tail=200 lightnovel          # 结构化日志
docker compose exec lightnovel sh -c 'tail -f /data/logs/plugin-*.log'
docker compose restart lightnovel                  # 未完成任务自动标记 interrupted
docker compose down && docker compose up -d --build  # 升级
```

- **备份**：只需备份宿主机 `/vol1/1000/lightnovel`（含 library + 任务状态）。
- **权限**：若 SMB 中看不到 EPUB，检查 `LN_UID`/`LN_GID` 是否与共享文件夹所有者一致。
- **限速**：默认同主机 4 秒一次，请勿调低；`LN_RESPECT_ROBOTS` 保持 `true`。
- **完整性**：把 `index.json` 与 `.sha256` 一起备份，可用 `sha256sum -c` 校验。

## 8. 排障

| 现象 | 原因 / 处理 |
|------|-------------|
| `novel_tasks.status` 显示 `dart.available: false` | `LN_DART_BINARY` 路径错误；镜像内应为 `/opt/bnp/bnp_headless` |
| 下载任务 `DART_UNAVAILABLE` | 同上，或 Dart SDK 未安装 |
| `SOURCE_DISABLED` | 书源未写入 `LN_ENABLED_SOURCES`，或受限书源被策略禁用 |
| `RESTRICTED_SOURCE` | 目标书源可能需要登录；插件按设计拒绝，不提供凭据 |
| `robots.txt disallows ...` | 站点规则禁止；请尊重该规则，不要关闭 `respectRobots` 绕过 |
| EPUB `integrity: failed` | 查看 `novel_tasks get` 的 `integrityError` 与日志；可 `retry` 任务 |
| 容器启动即退出 | 默认 `--dump-config` 是自检命令，属正常；常驻请改 `command` |

# Studio WebUI

Novel & Manga Library 的管理界面使用 React、TypeScript 和 Vite。搜索、书库和下载任务支持按轻小说和漫画筛选。小说详情、漫画详情以及当前页面的筛选可通过 URL 保留。

## 本地预览与 Live 部署

从仓库根目录执行。

```sh
npm --prefix web ci
npm --prefix web run dev -- --host 127.0.0.1
```

默认是 Mock 模式，用于预览搜索、书架和下载交互。要连接真实服务，准备插件构建产物、Dart 和上游配置，按 [NAS 部署指南](../docs/DEPLOY-NAS.md#4-web-管理台bff--live-前端) 启动 BFF。前端生产构建命令如下。

```sh
VITE_API_MODE=live npm run web:build
```

`server/serve.mjs` 同源托管 `web/dist/` 和 `/api/`。默认监听 `127.0.0.1:5273`，容器内使用 `0.0.0.0:8080`。前端 API 路径默认是 `/api`，可用 `VITE_API_BASE` 覆盖。Live 遇到上游故障时显示实际错误。

## 常用操作

- **轻小说** · 搜索作品，打开详情页选卷，提交 EPUB 下载。任务完成后在「我的书库」查看文件，可下载或校验。
- **漫画** · 在搜索页选择「漫画」并筛选来源，进入作品详情后选择章节提交下载。已部署归档服务时，也可选卷并点「一键下载到 Komga」。
- **书库** · Studio 书库汇总 EPUB 与 Suwayomi 书架。切换到 Komga 后，可浏览该实例中凭据有权查看的系列。
- **下载队列** · 进入「下载任务」，按类型与状态筛选。可用操作以各下载后端为准。
- **系统设置** · 查看连接情况，选择保存目录，配置 Komga 或发放 DSH 只读 API 密钥。

## 首次创建管理员

Docker 版 Studio 默认启用账号登录。首次打开页面时，从挂载的数据目录读取 `auth/setup-code`，或使用环境变量 `LN_STUDIO_SETUP_CODE`，再设置账号和至少 10 个字符的密码。

```sh
docker compose -f docker-compose.web.yml exec web cat /data/auth/setup-code
```

登录时可选择此设备 8 小时、1 天、7 天或 30 天免登录。到期需要重新登录，退出登录会立即注销当前会话。账号与会话保存在数据目录的 `auth/studio.sqlite`，升级时继续挂载同一目录。

通过 HTTPS 反代访问时，设置 `LN_STUDIO_SECURE_COOKIE=true`。反代改写 Host 时，还需设置 `LN_STUDIO_WEB_ORIGIN` 为浏览器看到的完整 origin。账号登录使用同源部署。独立脚本可继续使用已配置的 `LN_BFF_TOKEN`，DSH 原生工具仍连接原有的 Docker 服务。

直接运行 `node server/serve.mjs` 时，可通过 `LN_STUDIO_ACCOUNTS=true` 启用账号登录。纯 Mock 模式不请求登录接口。

## 分别设置下载保存目录

登录后打开「系统设置 → NAS 保存目录」。点击「浏览 NAS」，在文件夹列表中逐级进入子目录，也可以点目录层级跳回上级。轻小说 EPUB 和漫画 CBZ 分开设置，可选择已有目录或新建后使用。切换后，新生成的文件会写入新位置。旧文件及索引留在原目录，仍然可访问。轻小说可以恢复 Studio 原默认路径。漫画选项改变的是 CBZ 归档位置，Suwayomi 自己的章节缓存仍由 Suwayomi 管理。

Docker 部署在 `.env` 中指定 `LN_NOVEL_STORAGE_HOST`、`LN_MANGA_STORAGE_HOST`、`LN_DOWNLOAD_SETTINGS_HOST`，并提前创建这三个目录。要使用 Komga，前两个路径应分别位于它对应的书库里。归档容器和 Studio 需共享同一个 `LN_DOWNLOAD_SETTINGS_HOST`，并将 `SUWAYOMI_VOLUME_OUTPUT_DIR` 设置为 Studio 的 `LN_MANGA_STORAGE_HOST`。独立 Compose 请使用绝对路径。Suwayomi 归档服务读取设置后，下一次扫描生效。Dart 独立 DSH 进程的小说保存路径仍由其插件配置控制。

接口为 `GET /api/settings/download-folders`、`GET /api/settings/download-folders/browse?kind=novel&folder=`、`POST /api/settings/download-folders`。提交相对于各自挂载的路径，如 `{"kind":"novel","folder":"收藏","create":true}`。仅支持已挂载根目录下的目录，拒绝符号链接和越界路径。

### 同步 Komga 书库路径

在轻小说或漫画卡片点击「同步 Komga 路径」，选书库后点击「同步路径并刷新」。Studio 会选择该 Komga 书库与当前类型可写挂载的共同目录。例如 Komga 书库根是 `/NAS/漫画`，Studio 挂载的是 `/NAS/漫画/Suwayomi`，则使用后者。两边的 NAS 路径名称需一致；范围外的书库只可请求刷新。此操作更新 Studio 的保存位置，Komga 库根和已有文件保持原位。

「仅刷新书库」只提交扫描。Komga 需要管理员权限，接受后在后台扫描。页面分别显示保存和扫描结果，可在扫描完成后从「我的书库 → Komga」查看。接口为 `GET /api/settings/download-folders/komga?kind=manga` 和 `POST /api/settings/download-folders/komga`，POST 传 `kind`、`libraryId` 和 `action`（`sync` 或 `scan`）。两者都需要 Studio 管理员会话。

## Komga API 和 DSH 只读密钥

管理员登录后，打开「系统设置 → 服务集成」。在 Komga 区域填写服务地址和 Komga 生成的 API Key，点击「测试并保存」。Studio 会验证能否读取书库，成功后立即用于 WebUI。地址应列在部署的 `LN_KOMGA_ALLOWED_URLS` 中，或与原有 `LN_KOMGA_URL` 一致。Komga 密钥保存在 Studio 私有数据目录，页面不会回显。

点「生成只读密钥」后立即复制。每个 Studio 实例有一个有效的 DSH 只读密钥，重新生成和撤销会使旧密钥立即失效。用 `Authorization: Bearer <令牌>` 调用 Studio 的健康、书库、任务和漫画归档状态接口。密钥无法提交下载、删除文件或读取管理设置。

DSH 可将令牌保存在仅运行用户可读的文件中，并设置 `LN_STUDIO_READ_URL`（Studio 的 HTTP(S) origin）和 `LN_STUDIO_READ_TOKEN_FILE`（容器内文件路径）。例如调用 `studio_read(resource="mangaTasks")` 查询队列，或 `studio_read(resource="komga")` 查询 Komga 书库。已有漫画下载工具继续使用 Suwayomi Docker API。不要把令牌放进对话、URL 或仓库。

## HTTP API

账号登录启用时，浏览器使用会话 Cookie。独立脚本可使用配置过的 `LN_BFF_TOKEN`。DSH 只读密钥有单独的 GET 接口范围。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/auth/status` | 初始化与登录状态，Compose 健康检查使用 |
| POST | `/api/auth/setup` · `/api/auth/login` · `/api/auth/logout` | 创建首个管理员、登录或撤销会话 |
| GET / POST | `/api/settings/download-folders` | 查询或保存两类文件的目标目录 |
| GET | `/api/settings/download-folders/browse` | 浏览允许的子目录 |
| GET / POST | `/api/settings/integrations` | 管理 Komga 配置与 DSH 只读密钥 |

### 轻小说接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | `{ok, dart, uptime}` |
| GET | `/api/status` | 运行时、书源、Dart runner basename、书库统计、`features` |
| GET | `/api/novels?query=&sources=&status=&limit=` | 空 query = 精选（本地索引 + 离线源，不触网）；有 query 才搜索 |
| GET | `/api/novels/:id` | 详情；Dart 可用时带分卷，失败回退索引 |
| GET | `/api/novels/:id/volumes` | 分卷 |
| GET / POST | `/api/tasks` | 列表 / 创建 |
| POST | `/api/tasks/:id/cancel` \| `/retry` | 取消 / 重试 |
| GET | `/api/library?query=` | 书库索引 |
| GET | `/api/library/stats` | 统计 |
| POST | `/api/library/:id/verify` | SHA-256 校验 |
| GET / HEAD | `/api/library/:id/file` | EPUB 流（`application/epub+zip`） |
| DELETE | `/api/library/:id` | 需显式开启，否则 403 `DELETE_DISABLED` |
| GET | `/api/sources` / `/api/activities` | 书源注册表 / 最近活动 |

错误体统一为 `{ "error": { "code": "...", "message": "..." } }`；请求体上限 64KB（超出 413 `BODY_TOO_LARGE`）；未知路由 404 `NOT_FOUND`。

### 其他接口

- [Suwayomi 漫画接口](../docs/MANGA.md#bff-接口)
- [Komga 书库接口](../docs/KOMGA.md#接口)
- [漫画归档与 Docker 进度接口](../docs/MANGA-VOLUME-CBZ.md)

## 截图与开发

[桌面书库](../docs/images/studio-library.jpg) · [手机漫画详情](../docs/images/studio-manga-mobile.jpg) · [开发和验证](../docs/README.md#开发和验证)

早期设计的截图和排版对照仍保存在 [web/docs](docs/COMPARISON.md)。

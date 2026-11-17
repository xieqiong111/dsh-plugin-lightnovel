# Suwayomi 漫画集成

Novel & Manga Studio 使用同一个 WebUI 和 BFF。小说请求继续走 PluginRuntime 和 Dart，漫画请求由共享适配器调用 Suwayomi。两套服务分别保存资源、任务和下载文件。DSH 原生工具的安装与验证见 [DSH-MANGA.md](./DSH-MANGA.md)。

## 飞牛 NAS 部署

目标平台为 Linux x86-64。漫画适配以 [Suwayomi-Server v2.4.2366](https://github.com/Suwayomi/Suwayomi-Server/releases/tag/v2.4.2366) 为基准。Compose 中的 WebUI 保留原有小说工作目录和 EPUB 下载目录，独立的 Suwayomi 服务保存漫画数据、配置和下载。

1. 按 [原有 WebUI 部署说明](./DEPLOY-NAS.md) 准备插件依赖、Linux x86-64 的 `bnp_headless`、Live 构建产物和外部 Docker 网络。
2. 全新部署从 `.env.example` 创建 `.env`。升级使用原来的 `.env`，保留 Studio 当前使用的小说目录。在宿主机预先创建 `LN_STUDIO_DATA_DIR` 指向的目录，并确保 `LN_UID:LN_GID` 可以读写该目录。并行运行 DSH 时同样准备其 `LN_DATA_DIR`。使用内置服务时，把 `SUWAYOMI_URL` 设为 `http://suwayomi:4567`。连接现有实例时，使用 WebUI 容器可达的 HTTP(S) 服务地址。Docker 里的 `127.0.0.1` 指向 WebUI 容器自身。
3. 启动相应服务。
   - Compose 管理 Suwayomi 时，运行 `docker compose -f docker-compose.web.yml --profile manga up -d`。
   - 连接现有实例时，运行 `docker compose -f docker-compose.web.yml up -d web`。如果现有容器与 Studio 位于同一 Docker 网络，可在 URL 使用其容器别名。
4. Suwayomi 管理端口默认只绑定 NAS 的 `127.0.0.1:4567`。可在电脑上用 `ssh -L 4567:127.0.0.1:4567 user@nas` 访问并安装扩展。打开 Studio 的「资源源管理」检查漫画服务。刚初始化、没有可测试章节时，章节读取显示「未验证」。

若 DSH 与 Studio 都使用仓库提供的 Compose，可通过 `docker compose -f docker-compose.yml -f docker-compose.web.yml --profile manga up -d web suwayomi` 启动 WebUI 及漫画服务，再通过相同的两个配置文件运行 `lightnovel` 服务。这会让三个容器共用 Compose 外部网络。两套小说进程必须使用不同的存储目录。按模板设置独立的 `LN_STUDIO_DATA_DIR`，避免两个进程同时改写同一书库索引和任务记录。升级单独运行的 Studio 时，可沿用原 `.env` 和现有小说目录。

Suwayomi 的数据和配置保存在 `suwayomi-data`，下载保存在 `suwayomi-downloads`，对应 [官方容器挂载路径](https://github.com/Suwayomi/Suwayomi-Server-docker#downloads-folder)。备份应包含两个卷。EPUB 与小说数据库仍按原有小说部署规则备份。切换 WebUI 指向的 Suwayomi 实例后，旧漫画链接中的数字 ID 由新实例解释。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `SUWAYOMI_URL` | 进程可达的固定 HTTP(S) origin，例如 `http://suwayomi:4567`。缺省时仅轻小说可用。 |
| `SUWAYOMI_USERNAME` / `SUWAYOMI_PASSWORD` | 上游启用 HTTP Basic 时成对提供。WebUI 和 DSH 进程使用各自的服务端环境，浏览器持有 BFF `X-LN-Token`。配置上游 Basic 凭据时必须设置 `LN_BFF_TOKEN` 才能启用 Studio 漫画 API。 |
| `SUWAYOMI_TIMEOUT_MS` | 每次上游请求的超时，适用于 GraphQL 和封面。 |
| `SUWAYOMI_TITLE_ALIASES` | 可选 JSON 别名组，例如 `[["星港邮差","星際信使"]]`。最多 100 组，每组 2–8 个标题。识别后仍由 Suwayomi 的源搜索。 |
| `SUWAYOMI_AUTH_MODE` | 仅设置 Compose 管理的 Suwayomi，默认 `none`，可使用 `basic_auth`。 |
| `SUWAYOMI_ADMIN_BIND` / `SUWAYOMI_ADMIN_PORT` | 管理端口的宿主机监听地址和端口，默认为 `127.0.0.1:4567`。 |
| `LN_STUDIO_PORT` / `LN_STUDIO_DATA_DIR` | Studio 的端口和小说存储，可分别继承旧的 `LN_WEB_PORT` 和 `LN_DATA_DIR`。 |
| `LN_BFF_TOKEN` | 可选的 WebUI/BFF 认证令牌，独立于上游凭据。 |
| `VITE_API_MODE` | `mock`（默认）使用演示数据。部署时使用 `live`，漫画服务故障时显示真实错误。 |

连接变量也接受 `LN_SUWAYOMI_URL`、`LN_SUWAYOMI_USERNAME`、`LN_SUWAYOMI_PASSWORD` 和 `LN_SUWAYOMI_TIMEOUT_MS`，同一变量同时设置时优先使用 `LN_` 前缀。上游地址由进程环境提供。BFF 使用固定的 GraphQL 路径，封面代理仅接受相同 origin 中与该漫画 ID 对应的Suwayomi 封面路径。代理拒绝重定向，限制上游请求及响应大小。浏览器请求里不接受上游 URL，也不会得到 Suwayomi 凭据。

## BFF 接口

相同版本的原有小说 `/api/*` 路由和 BFF 认证继续适用。漫画端点均在 `/api/manga` 下，以下省略该前缀。所有资源 ID 在 JSON 中使用字符串。漫画按 `sourceId` 和 `id` 区分，书库和队列还保留 `manga:`、`novel:` 类型命名空间。

| 方法 | 路径 | 请求与响应 |
| --- | --- | --- |
| GET | `/health` | 返回 `reachable`、`authenticated`、`compatible`、`installedSources`、`chapters`、可选 `version` 和 `message`。检查无法确认时使用 `null`。 |
| GET | `/sources` | `{ sources }`。每项含 `id,name,lang`。健康检查中的扩展源数量不含 Suwayomi 本地源。 |
| GET | `/search?query=标题&sourceId=…&page=1&offset=0` | `sourceId` 可省略。返回 `{ mangas,hasNextPage,nextOffset,resultId,truncated,errors }`。若有 `nextOffset`，带上同一 `page` 和 `resultId` 读取余项，再进入下一源站页。结果快照过期时重新搜索。简繁转换与配置别名只扩展查询词，同名结果保留各自来源和 ID。 |
| GET | `/:id` | 返回漫画资料、来源、语言、状态、书架成员身份及服务实际提供的章节汇总。未初始化时读取源资料。 |
| GET | `/:id/chapters?limit=50&offset=0` | `{ chapters,totalCount,hasNextPage }`。每项含 `id,mangaId,name,uploadDate,read,downloaded,pageCount`。 |
| POST | `/:id/chapters/refresh` | 触发 Suwayomi 的 `fetchMangaAndChapters`，返回最新章节页。 |
| GET | `/:id/cover` | 通过 BFF 认证返回封面图片。没有封面时用占位图。 |
| GET | `/library?limit=50&offset=0` | `{ mangas,totalCount,hasNextPage }`。只读取 Suwayomi 书架。 |
| POST | `/:id/library` | `{ "inLibrary": true }`，修改并读取书架成员身份。 |
| POST | `/:id/subscribe` | `{ "subscribed": true }`，使用同一书架成员能力。取消订阅会移出漫画书架。 |
| POST | `/library/refresh` | `{ "categoryIds": [...] }`，触发 Suwayomi 原生书架更新。省略分类时采用 Suwayomi 默认策略。 |
| GET | `/downloads` | `{ queue,state,count }`。每个任务包含真实章节、队列状态和 `percent`（无数据时为 `null`）。 |
| POST | `/downloads/cancel` | `{ "chapterIds": ["456"] }`，请求从 Suwayomi 下载队列移除指定章节。 |
| POST | `/downloads` | `{ "mangaId": "123", "chapterIds": ["456"] }`。校验章节归属，返回 `queued,completed,skipped,unconfirmed`。已在队列的章节返回 `queued` 阶段的观察结果，已在提交前下载或排队的章节进入 `skipped`，本次回读已下载的章节进入 `completed`，无法证实的章节进入 `unconfirmed`。 |

POST 请求使用 `Content-Type: application/json`。失败使用 `{ "error": { "code": "...", "message": "..." } }`。Suwayomi 连接失败、认证失败、扩展搜索失败、更新冲突与不兼容响应通过漫画路由返回。浏览器按适用能力禁用队列操作。下载完成的项目可能从 Suwayomi 队列消失，详情页的已下载章节仍可查询。Suwayomi 本地源的章节已经位于服务的数据目录，详情页禁用下载操作。

书架成员身份是 Studio 的追更显示依据。定时检查、分类筛选、章节下载策略和更新冲突由 Suwayomi 管理。轻小说的自动追更依旧是占位。

## 验证入口

- 仓库根目录运行 `npm run typecheck`、`npm run build`、`npm test`、`npm run test:dart`、`npm run verify:web`。
- 单独验证漫画 API 与上游契约时，运行 `npx vitest run test/unit/suwayomi-client.test.ts test/unit/manga-api.test.ts`。
- 前端的 `npm run typecheck`、`npm run build` 和 `VITE_API_MODE=live npm run build` 分别验证类型和双模式生产构建。
- 在 Mock 前端预览启动后运行 `npm run verify:manga`，可通过 `MANGA_SCREENSHOTS_DIR` 导出浏览器截图。
- 使用临时数据目录和 GraphQL fixture 启动 Live BFF 后，可将 `MANGA_WEB_URL` 指到该 BFF，再在 `web/` 下运行前端测试。

```bash
# 从仓库根启动 GraphQL fixture，默认回环端口 4568
node test/support/serve-suwayomi-mock.mjs

# 另一终端启动 Live BFF。使用一个新的小说临时目录
SUWAYOMI_URL=http://127.0.0.1:4568 LN_BFF_DATA_DIR="$(mktemp -d)" LN_OFFLINE_ONLY=true node server/serve.mjs

# 在 web/ 运行浏览器测试
MANGA_WEB_URL=http://127.0.0.1:5273 MANGA_TEST_PROFILE=fixture MANGA_TEST_QUERY=星港邮差 MANGA_TEST_PROGRESS=37 npm run verify:manga:live
```

将 BFF 指向一个不可达的 Suwayomi 地址时，`MANGA_TEST_PROFILE=offline` 验证漫画断线及小说检索。连接带自建本地漫画的真实 Suwayomi 时，可用 `MANGA_TEST_PROFILE=local` 验证搜索、详情、封面与书架。该模式会向测试漫画书架写入条目，适用于隔离实例。

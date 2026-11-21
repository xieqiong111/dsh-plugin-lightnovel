# 在 DSH 中刮削 Komga 元数据

Studio 通过 [BangumiKomga](https://github.com/chu-shen/BangumiKomga) 的转换模块获取 Bangumi 元数据。Docker 镜像固定上游源码版本。DSH 工具可以搜索候选、列出系列的单册、预览改动，并将已确认的变更写到 Komga。支持漫画和轻小说，以及系列和单册。

单次操作只处理一个明确选定的条目。系列可更新标题、简介、出版社、别名、标签和链接。单册可更新简介、作者、发行日期、标签和链接。已有的锁定字段、文件、封面、册序和阅读进度保留。已有自定义标签、作者、别名和链接会合并。若 Komga 的 `cbl` 链接指向另一条目，工具会要求重新核对。

## Docker 和 DSH 0.2.2-rc.1

1. 在 Studio「系统设置 → 服务集成」配置 Komga。写元数据需要 Komga 管理员权限，也可只通过部署时配置的 `LN_KOMGA_*` 连接。Studio 继续使用现有连接，转换容器只访问 Bangumi。 [Komga 系列接口](https://komga.org/docs/openapi/update-series-metadata/) · [Komga 单册接口](https://komga.org/docs/openapi/update-book-metadata/)
2. 在 Studio 已挂载的数据目录的 `auth` 下生成专用密钥。下例使用默认宿主机目录 `./data`，首次部署若使用其他路径，把命令里的目录改为实际值。生成后仅让 Studio 和 DSH 的运行账户读取该文件。
   ```sh
   mkdir -p ./data/auth
   (umask 077; set -C; node -e 'process.stdout.write("studio_metadata_" + require("node:crypto").randomBytes(32).toString("base64url") + "\n")' > ./data/auth/studio-metadata.token)
   ```
3. 为 Studio 配置下列变量，再启用可选 Docker 服务。转换容器通过内部 Docker 网络提供 API，无宿主机端口。需要访问受限 Bangumi 条目时可选配服务端 `BANGUMI_ACCESS_TOKEN`。
   ```dotenv
   LN_BANGUMIKOMGA_URL=http://bangumikomga:8091
   LN_STUDIO_METADATA_TOKEN_FILE=/data/auth/studio-metadata.token
   ```
   ```sh
   docker compose -f docker-compose.web.yml --profile metadata up -d --build web bangumikomga
   ```
4. 在 DSH 环境安装本版本插件并重启 DSH 进程。为 DSH 设置它能访问的 Studio 地址和专用密钥文件路径。独立 DSH 容器挂载该文件后使用容器内路径。已设 `LN_STUDIO_READ_URL` 时可复用其地址。现有 `studio_read` 继续使用自己的只读密钥。
   ```dotenv
   LN_STUDIO_METADATA_URL=http://lightnovel-studio-web:8080
   LN_STUDIO_METADATA_TOKEN_FILE=/data/auth/studio-metadata.token
   ```

## Agent 调用

查找 Komga 系列可用 `studio_read(resource="komga")` 和 `studio_read(resource="komgaSeries", libraryId="…")`，或者从 Komga 中获取对应 ID。

| `komga_bangumi_metadata` 的 `action` | 参数 | 行为 |
| --- | --- | --- |
| `search` | `kind` 为 `novel` 或 `manga`，`scope` 为 `series` 或 `book`，以及 `query` | 返回 Bangumi 条目 ID、中文和原文标题、简介与链接。排序分数用于排查匹配 |
| `books` | `seriesId`，可选 `page`，从 0 开始 | 返回系列下的 Komga 单册 ID 与册序 |
| `preview` | `kind`、`scope`、`seriesId`、`subjectId`，单册另填 `bookId` | 返回修改前后差异。存在改动时返回有效期 10 分钟的 `previewId` |
| `apply` | `previewId` | 用户确认后调用。写入一个条目，当前值变化时返回冲突并要求重新预览 |

HTTP 对应 `POST /api/komga/metadata/{search,books,preview,apply}`，请求 JSON 仅包含上表所列参数。使用 `Authorization: Bearer <元数据专用密钥>`。搜索和预览的状态由实际服务响应决定。写入以 Komga 返回 `204` 为准。预览由当前 Studio 进程管理，服务重启后重新生成。

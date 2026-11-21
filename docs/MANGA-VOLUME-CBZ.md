# 下载后生成分卷 CBZ

独立归档服务每 60 秒查看 Suwayomi 已下载的章节。WebUI、DSH 以及 Suwayomi 自己的下载都由同一个服务归档。归档通过 Suwayomi 的 `/api/v1/chapter/{id}/download` 读取已完成的数据，沿用原始图片格式和页序。每卷输出一个 `第01卷.cbz`，含连续页号和供 Komga 读取的 `ComicInfo.xml`。

- 源有 `第1卷`、`Volume 1` 等整卷条目时，下载完成即归档。整卷条目优先于同源同卷的分话条目。
- 源有 `第1卷 第1话`、`Vol. 1 - Chapter 1` 等带卷号的分话条目时，等该卷所有已列出的分话下载完成，按话号合成一个 CBZ。卷的范围以当前来源的章节目录为准。来源后续补话会在下载完成后更新对应归档。
- 纯话号、画集、预告以及无法选定版本的重复分卷会跳过。Suwayomi 仍可正常阅读和管理这些下载。
- 作品目录包含来源 ID 和 Suwayomi 作品 ID。同名作品各自归档。写入失败时保留原有 CBZ，原始下载始终由 Suwayomi 管理。

## Studio 一键下载

在漫画详情的「下载到 Komga」选择一卷，点击「一键下载到 Komga」。Studio 会将该卷对应的条目提交给Suwayomi 下载队列，并跳过已经下载或已排队的条目。超过 100 话的分卷可使用章节区分批下载。点击「刷新归档状态」确认 CBZ 已写入目录。书库里的条目会在 Komga 扫描该目录后出现。

BFF 接口为 `GET /api/manga/:id/komga`（每卷的总条目数、已下载数和已写入文件名）和 `POST /api/manga/:id/komga`（请求体 `{"volume":2}`，返回 Suwayomi 确认的队列结果）。卷号以归档服务读取到的来源目录为准。

## DSH 和 Docker 进度

将 DSH 接入同一 Docker 网络，并设置与 Studio 相同的 `LN_VOLUME_ARCHIVE_URL`。也可在 DSH 插件配置中用 `mangaConnectionFile` 指向私有 JSON 文件，并在其中加入 `LN_VOLUME_ARCHIVE_URL`。DSH 原生工具 `manga_komga_status(mangaId, volume?)` 查询指定漫画的分卷、真实章节队列进度和已写入文件名。选定卷后调用 `manga_komga_download(mangaId, volume)` 提交任务。

Studio BFF 的 `GET /api/manga/:id/komga?volume=2` 可限定卷号。每卷的 `tasks` 返回 Suwayomi 队列中的章节状态和 `percent`。百分比对应正在下载的那一话。拿不到百分比时返回 `null`。全部条目下载齐后显示 `waiting_archive`，实际 CBZ 写入后显示 `archived`。

归档容器还提供内部只读 `GET http://suwayomi-volume-cbz:8788/downloads`，返回 Suwayomi 的当前队列。容器每 15 秒查看一次队列，只在状态或百分比变化时记录日志。运行 `docker compose -f docker/volume-cbz/compose.yml logs -f volume-cbz` 可以查看下载进度和 CBZ 生成记录。

## Docker 部署

用现有 Suwayomi 实例的 Docker 网络。创建专用输出目录，例如 Komga 已扫描的漫画库目录下的 `Suwayomi`，让归档容器运行用户可写且让 Komga 可读。NAS 上可以让这两个容器使用同一 UID/GID。Docker 归档容器仅挂载此子目录，认证 JSON 以只读方式挂载。认证文件需要运行用户能读取，建议权限 `0600`，无需提交到仓库。可以复用 DSH 的连接 JSON，文件字段为 `LN_SUWAYOMI_URL`，若 Suwayomi 启用了 Basic 认证，再填写 `LN_SUWAYOMI_USERNAME` 和 `LN_SUWAYOMI_PASSWORD`。URL 应为容器可访问的 HTTP(S) origin，例如 `http://suwayomi:4567`。

将以下变量写入本地 `.env` 或通过运行环境传入。

```dotenv
SUWAYOMI_VOLUME_NETWORK=dsh-lightnovel-net
SUWAYOMI_VOLUME_CONNECTION_FILE=/path/to/suwayomi.json
SUWAYOMI_VOLUME_OUTPUT_DIR=/path/to/komga/library/Suwayomi
SUWAYOMI_VOLUME_UID=1000
SUWAYOMI_VOLUME_GID=1000
```

```sh
docker compose --env-file .env -f docker/volume-cbz/compose.yml up -d
docker compose --env-file .env -f docker/volume-cbz/compose.yml logs volume-cbz
```

在 Studio 的环境变量中设置 `LN_VOLUME_ARCHIVE_URL=http://suwayomi-volume-cbz:8788`。Studio 与归档服务需加入同一个内部 Docker 网络，归档状态端口无需对宿主机发布。

首次启动会检查已经下载的卷。停止归档服务后，已经生成的 CBZ 仍可阅读。`DOWNLOAD_AS_CBZ` 是 Suwayomi 自己的单话打包设置，归档支持 Suwayomi 以图片目录或 CBZ 保存的下载。

## 本地验证

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s docker/volume-cbz -v
```

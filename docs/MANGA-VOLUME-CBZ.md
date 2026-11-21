# 下载后生成分卷 CBZ

独立归档服务每 60 秒查看 Suwayomi 已下载的章节。WebUI、DSH 以及 Suwayomi 自己的下载都由同一个服务归档。归档通过 Suwayomi 的 `/api/v1/chapter/{id}/download` 读取已完成的数据，沿用原始图片格式和页序。每卷输出一个 `第01卷.cbz`，含连续页号和供 Komga 读取的 `ComicInfo.xml`。

- 源有 `第1卷`、`Volume 1` 等整卷条目时，下载完成即归档。整卷条目优先于同源同卷的分话条目。
- 源有 `第1卷 第1话`、`Vol. 1 - Chapter 1` 等带卷号的分话条目时，等该卷所有已列出的分话下载完成，按话号合成一个 CBZ。卷的范围以当前来源的章节目录为准。来源后续补话会在下载完成后更新对应归档。
- 纯话号、画集、预告以及无法选定版本的重复分卷会跳过。Suwayomi 仍可正常阅读和管理这些下载。
- 作品目录包含来源 ID 和 Suwayomi 作品 ID。同名作品各自归档。写入失败时保留原有 CBZ，原始下载始终由 Suwayomi 管理。

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

首次启动会检查已经下载的卷。停止归档服务后，已经生成的 CBZ 仍可阅读。`DOWNLOAD_AS_CBZ` 是 Suwayomi 自己的单话打包设置，归档支持 Suwayomi 以图片目录或 CBZ 保存的下载。

## 本地验证

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s docker/volume-cbz -v
```

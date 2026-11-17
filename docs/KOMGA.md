# 连接 Komga 书库

在 Studio 中打开 **我的书库 → Komga**。切换 Komga 书库后，可以搜索标题、分页浏览系列、查看封面、册数和已读数量。书库与查询保存在当前页面的 URL 中。已读数量以 Studio 使用的 Komga 凭据为准。

Studio 以只读方式浏览 Komga 中已建立的书库。媒体文件、扫描和阅读记录由 Komga 管理。轻小说 EPUB 与 Suwayomi 漫画仍从同一页面的 **Studio 书库** 打开。

## 连接现有 Komga

在 Studio 的服务端环境设置：

```dotenv
LN_KOMGA_URL=http://komga:25600
LN_KOMGA_API_KEY=
LN_BFF_TOKEN=
```

将地址改为 Studio 进程可访问的 Komga 地址。示例使用同一 Docker 网络内的服务名，反向代理部署可在地址中包含 Komga 的固定子路径，例如 `https://nas.example/komga`。

- 填入已有的 Komga API Key，或将 `LN_KOMGA_API_KEY` 留空并设置 `LN_KOMGA_USERNAME`、`LN_KOMGA_PASSWORD`。Komga 的书库访问权限适用于 Studio 展示的内容。
- 使用 Komga 凭据时，同时设置独立的 `LN_BFF_TOKEN`。在 Studio 的「系统设置」中保存这个 BFF 令牌。Komga 凭据只保存在服务端环境。
- `LN_KOMGA_TIMEOUT_MS` 默认为 8000 毫秒。将 `LN_KOMGA_URL` 留空时，Komga 保持未配置状态。

Docker 部署更新原有 `.env` 后，重新构建 Live 前端并运行 `docker compose -f docker-compose.web.yml up -d web` 以应用环境。直接运行 Node 时，使用 `node --env-file=.env server/serve.mjs`。已有其他运行参数可继续沿用。

## 接口

适配以 Komga 1.30 的 [官方 REST API](https://komga.org/docs/openapi/komga-api/) 为准。Studio 的 BFF 路径为：

| 接口 | 用途 |
| --- | --- |
| `GET /api/komga/status` | 检查服务配置和连通性 |
| `GET /api/komga/libraries` | 列出凭据可访问的 Komga 书库 |
| `GET /api/komga/series?libraryId=…&query=…&page=0&size=24` | 查询所选书库中的系列 |
| `GET /api/komga/series/:id/thumbnail` | 代理系列封面 |

Live 页面遇到连接、权限或上游错误时直接显示错误。Mock 构建使用标注过的演示书库。

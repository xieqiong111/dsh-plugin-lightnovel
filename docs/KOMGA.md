# 连接 Komga 书库

在 Studio 中打开 **我的书库 → Komga**。切换 Komga 书库后，可以搜索标题、分页浏览系列、查看封面、册数和已读数量。书库与查询保存在当前页面的 URL 中。已读数量以 Studio 使用的 Komga 凭据为准。

Studio 以只读方式浏览 Komga 中已建立的书库。媒体文件、扫描和阅读记录由 Komga 管理。轻小说 EPUB 与 Suwayomi 漫画仍从同一页面的 **Studio 书库** 打开。

## 连接现有 Komga

### 在 WebUI 配置 API Key

1. 在 Studio 的部署环境中配置 `LN_KOMGA_ALLOWED_URLS`，填入可从 Studio 容器访问的 Komga 地址，例如 `http://komga:25600`。已有的 `LN_KOMGA_URL` 也会加入可选地址。通过反代时可填写固定子路径，例如 `https://nas.example/komga`。
2. 登录 Studio，进入「系统设置 → 服务集成 → Komga API」。选择地址、粘贴从 Komga 生成的 API Key，点击「测试并保存」。连接通过后，管理台即可读取该密钥有权访问的书库。
3. 前往「我的书库 → Komga」选择书库。

### 通过环境变量配置

```dotenv
LN_KOMGA_URL=http://komga:25600
LN_KOMGA_API_KEY=
```

也可使用 `LN_KOMGA_USERNAME` 与 `LN_KOMGA_PASSWORD`，两种认证方式选一种。配置后重新创建 Studio 容器以应用环境。直接启动可使用 `node --env-file=.env server/serve.mjs`。

Docker 版默认使用管理员会话保护这些接口。仅使用兼容脚本模式时，可在服务端配置独立的 `LN_BFF_TOKEN`。Studio 对 Komga 的请求使用服务端凭据，浏览器无需持有此密钥。

向目录写入 CBZ 与浏览书库是两项独立功能。文件输出位置由 [分卷归档服务](MANGA-VOLUME-CBZ.md)管理，Komga 扫描后才会显示新增文件。

## 接口

适配以 Komga 1.30 的 [官方 REST API](https://komga.org/docs/openapi/komga-api/) 为准。Studio 的 BFF 路径为：

| 接口 | 用途 |
| --- | --- |
| `GET /api/komga/status` | 检查服务配置和连通性 |
| `GET /api/komga/libraries` | 列出凭据可访问的 Komga 书库 |
| `GET /api/komga/series?libraryId=…&query=…&page=0&size=24` | 查询所选书库中的系列 |
| `GET /api/komga/series/:id/thumbnail` | 代理系列封面 |

Live 页面遇到连接、权限或上游错误时直接显示错误。Mock 构建使用标注过的演示书库。

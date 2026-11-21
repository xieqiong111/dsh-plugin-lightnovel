# 文档索引

| 我想做什么 | 阅读 |
| --- | --- |
| 在飞牛 NAS / Linux x86-64 部署 | [Docker 与 NAS 部署](DEPLOY-NAS.md) |
| 创建管理员、选择 EPUB 和 CBZ 保存目录 | [WebUI 使用指南](../web/README.md) |
| 接入漫画源、查看进度、管理 Suwayomi 书架 | [Suwayomi 集成和接口](MANGA.md) |
| 让下载完成的漫画自动按卷生成 CBZ | [分卷规则、归档和日志](MANGA-VOLUME-CBZ.md) |
| 在管理台浏览 Komga 书库 | [Komga 接入和接口](KOMGA.md) |
| 安装 DSH 插件，配置原生工具或只读密钥 | [DSH 安装和工具](DSH-MANGA.md) |
| 配置轻小说引擎、任务和在线来源 | [插件配置](CONFIG.md) · [在线书源说明](LIVE-SOURCES.md) |
| 调用 EPUB、登录或设置接口 | [WebUI 与 HTTP API](../web/README.md#http-api) |

## 开发和验证

根目录和 `web/` 各自有 npm 锁文件。前端开发用 Node.js 24.9 或更新版本。

```sh
npm ci
npm --prefix web ci
npm run typecheck
npm run build
npm test
npm run web:build
VITE_API_MODE=live npm run web:build
```

- `npm run test:dart` 使用 Dart 核心和离线书源生成并校验 EPUB。所需运行器见 [NAS 部署指南](DEPLOY-NAS.md#5-验证-dart-核心)。
- `npm run verify:web` 在隔离数据目录启动真实 BFF，验证 EPUB 和管理 API。运行前构建插件和 Live 前端，并准备 Dart 运行器。
- `python3 -m unittest discover -s docker/volume-cbz -v` 验证分卷、页序、下载进度映射和目录切换。
- 在 `web/` 内运行 `npm run verify:manga` 或 `npm run verify:manga:live` 验证浏览器流程。Live 测试的启动方式和变量见 [Suwayomi 验证入口](MANGA.md#验证入口)。
- [早期视觉对比](../web/docs/COMPARISON.md)记录轻小说界面的设计还原。

测试中的模拟上游、离线样例和真实 NAS 验收是不同环境。验证在线来源时，应以实际搜索、队列、文件和接口回读为准。

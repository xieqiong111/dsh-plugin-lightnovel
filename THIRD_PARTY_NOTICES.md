# Third-Party Notices

本插件包含第三方代码与依赖。各自许可证全文随包保留。

## 1. bili_novel_packer（vendored，MIT）

- 来源：https://github.com/montaro2017/bili_novel_packer
- 版本：`0.2.50`
- 许可：MIT License, Copyright (c) 2023 Sparks
- 许可证全文：`vendor/bili_novel_packer/LICENSE`
- 位置：`vendor/bili_novel_packer/`

原项目的 `LightNovelSource`（bilinovel / wenku8 采集与正文恢复）、`NovelPacker`、`EpubPacker`（OPF/NCX/nav、插图嵌入、ZIP 打包）被原样保留，仅做以下**加性**修改（不改动采集与打包逻辑）：

| 文件 | 修改 |
|------|------|
| `lib/console/console.dart` | 增加可替换的 `static StringSink out`，让 headless 模式把人类可读输出重定向到 stderr |
| `lib/headless/packer_hooks.dart` | **新增**：进度事件与协作式取消钩子 |
| `lib/headless/fixture_source.dart` | **新增**：离线测试书源，使自动化测试无需访问第三方站点 |
| `lib/novel_packer.dart` | 增加可选 `hooks`；`packVolume` / `packCombine` 返回产物路径并发出 `volume_start` / `chapter` / `volume_done` 事件 |
| `lib/epub_packer/epub_packer.dart` | `pack()` 前确保输出子目录存在（headless 会切换工作目录） |
| `bin/headless.dart` | **新增**：非交互 NDJSON 接口（`details` / `volumes` / `pack`） |
| `bin/main.dart` | 未修改，原交互式 CLI 保持可用 |

原项目的 `README.md`、`CHANGELOG.md`、`analysis_options.yaml` 与 `test/` 一并保留。

## 2. DeepSeek Harness（开发期依赖 / peer）

- 来源：https://github.com/deepseek-ai/deepseek-harness
- 版本：`0.2.2-rc.1`
- 用途：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`（`defineTool` / `ctx.tools.register`）、`@deepseek-ai/schemastery`（`Config` schema）、`@deepseek-ai/dsh`（CLI 与 profile 机制）
- 以 `peerDependencies` + `devDependencies` 声明，运行时由宿主 DSH 提供，不随本插件复制分发。

## 3. npm 运行时依赖

| 包 | 许可 | 用途 |
|----|------|------|
| `cheerio` | MIT | 公开搜索页 HTML 解析 |
| `opencc-js` | MIT | 繁体→简体转换；缺失时回退到内置映射表 |

开发/测试依赖：`typescript`（Apache-2.0）、`vitest`（MIT）、`@types/node`（MIT），以及上节 DSH 包。各包许可证见其 `node_modules/<pkg>/LICENSE`。

## 4. Dart 依赖（仅编译 vendored 核心时）

`archive`、`fast_gbk`、`html`、`intl`、`logger`、`path`、`synchronized`、`uuid`、`xml`、`dio`、`gbk_codec`、`test`、`lints` —— 版本约束见 `vendor/bili_novel_packer/pubspec.yaml`，均来自 pub.dev，各自许可证见对应包。编译产物 `bnp_headless` 随 Docker 镜像分发。

## 5. 测试素材

`test/fixtures/` 下的小说文本、书目元数据与 PNG 图片均为本插件为测试目的原创生成的虚构内容，不含第三方作品。

---

## 合规声明

本插件仅访问来源站点的公开页面，遵守 `robots.txt` 与限速，不携带 Cookie / Authorization，不绕过登录、付费或任何访问控制。使用者应自行确认对目标站点与作品的使用符合当地法律及站点条款；本插件不提供任何受版权保护内容。

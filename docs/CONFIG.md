# 配置参考

Cordis 在加载插件时用导出的 Schemastery `Config` schema 校验并填充默认值，然后调用 `apply(ctx, config)`。所有字段都可在 profile 的 `cordis.patch.yml` 中覆盖。

## 覆盖方式

`cordis.patch.yml` 是**按行替换**，后应用的层整块替换目标行的 `config`（不是深合并）。因此覆盖时必须重述该行需要的**所有**键，或直接用环境变量（默认层已经用 `!!js` 读环境变量，通常无需改 patch）。

```yaml
# $DSH_HOME/profiles/<name>/cordis.patch.yml
- patch:
    - id: lightnovel
      config:
        dataDir: /volume1/books/lightnovel-data
        libraryDir: /volume1/books/lightnovel
        offlineOnly: true
        enabledSources: [fixture]
        respectRobots: true
        requestIntervalMs: 4000
        maxConcurrentDownloads: 1
        maxRetries: 2
        logLevel: info
```

更简便的做法是只设环境变量（见下表），让默认 patch 层生效：

```bash
export LN_DATA_DIR=/volume1/books/ln-data
export LN_LIBRARY_DIR=/volume1/books/EPUB
export LN_DART_BINARY=/opt/bnp/bnp_headless
export LN_ENABLED_SOURCES=bilinovel,fixture
```

## 字段

### 路径与运行时

| 字段 | 类型 | 默认 | 环境变量 | 说明 |
|------|------|------|----------|------|
| `dataDir` | string | `''` → `$LN_DATA_DIR` → `~/.local/share/dsh-plugin-lightnovel` | `LN_DATA_DIR` | 任务、索引、日志根。启动时自动创建 `tasks/` `logs/` `index/` |
| `libraryDir` | string | `''` → `<dataDir>/library` | `LN_LIBRARY_DIR` | EPUB 库根；索引 `index.json` 中只存相对路径 |
| `dartBinary` | string | `''`（自动探测） | `LN_DART_BINARY` | 编译后的 `bnp_headless` 可执行文件 |
| `dartProjectDir` | string | 包内 `vendor/bili_novel_packer` | `LN_DART_PROJECT_DIR` | 使用 `dart run` 时的工程根；需 `LN_DART_SDK` 指向 SDK |
| `fixturesDir` | string | 包内 `test/fixtures` | `LN_FIXTURES_DIR` | 离线书源目录，需含 `books.json` / `novel.json` / `catalog.json` / `chapters/` / `images/` |

Dart 运行器探测顺序：`LN_DART_BINARY` → `/opt/bnp/bnp_headless` → `<dartProjectDir>/build/bnp_headless` → `dart run bin/headless.dart`（`dart` 来自 `$LN_DART_SDK/bin/dart` 或 PATH）。`novel_tasks {action:"status"}` 会回报探测结果与 `dart.available`。

### 书源与检索

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabledSources` | string[] | `['bilinovel','fixture']` | 书源 id：`bilinovel` / `wenku8` / `fixture` |
| `searchMode` | `'live'\|'local'\|'hybrid'` | `hybrid` | `local` 只查持久索引；`live` 只查在线；`hybrid` 先本地，无命中再在线并回填索引 |
| `searchTimeoutMs` | number | `15000` | 搜索/详情桥接超时 |
| `extraTraditionalMap` | string | `''` | 额外繁简对，格式 `臺台,裡里` |
| `userAgent` | string | `dsh-plugin-lightnovel/1.0 (+polite crawler; 1 request / 4s)` | 可识别的礼貌 UA |

`fixture` 是纯离线书源，用于 CI、无外网 NAS 与自动化测试；`wenku8` 为 `restricted`，默认即使写进 `enabledSources` 也会被禁用，除非 `allowNonPublicSources=true`（**仍不会提供任何凭据**）。

### 限速与合规

| 字段 | 类型 | 默认 | 环境变量 | 说明 |
|------|------|------|----------|------|
| `requestIntervalMs` | number | `4000` | `LN_REQUEST_INTERVAL_MS` | 同主机两次请求最小间隔；robots `Crawl-delay` 更大时取更大值 |
| `respectRobots` | boolean | `true` | `LN_RESPECT_ROBOTS` | 抓取前获取并遵守 robots.txt；服务器错误时拒绝抓取 |
| `offlineOnly` | boolean | `false` | `LN_OFFLINE_ONLY` | 只启用 `fixture`，且 `novel_download` 拒绝非 fixture 目标 |
| `allowNonPublicSources` | boolean | `false` | — | 允许受限书源；插件仍不携带 Cookie / Authorization |

### 任务与完整性

| 字段 | 类型 | 默认 | 环境变量 | 说明 |
|------|------|------|----------|------|
| `maxConcurrentDownloads` | number | `1` | `LN_MAX_CONCURRENT_DOWNLOADS` | 并发下载任务数 |
| `maxRetries` | number | `2` | `LN_MAX_RETRIES` | 单任务重试上限（`novel_tasks {action:"retry"}`） |
| `maxVolumesPerTask` | number | `50` | — | 单次下载允许的最大卷数 |
| `taskTimeoutMs` | number | `3600000` | — | 单任务墙钟超时 |
| `logLevel` | `'debug'\|'info'\|'warn'\|'error'` | `info` | `LN_LOG_LEVEL` | 结构化 JSONL 日志级别；`LN_LOG_ECHO=true` 同时输出到 stderr |

## 状态机与持久化

```
queued ──▶ running ──▶ completed
   │           │
   │           ├──▶ failed ────┐
   │           └──▶ cancelled ─┤
   └──▶ (进程重启) interrupted ┘
                    │
                    └──▶ retry ──▶ queued
```

- 每个任务一个 `tasks/<id>.json`，原子写（临时文件 + rename）。
- 重启时 `running` / `queued` 被标记为 `interrupted`，可 `retry`。
- `downloadedChapters`、`downloadedVolumes` 记录**实际**写入 EPUB 的章节名与卷名（来自 Dart 进度事件与产物，而非请求预填值）。
- 每个产物经 ZIP/EPUB 完整性校验：首个 `mimetype` 且未压缩、`container.xml`、`content.opf` manifest 目标全部存在且非空、spine、导航文档、章节/图片计数、`sha256`。
- 校验通过的产物复制到 library，写入 `.sha256` 旁路文件，`novel_library {action:"verify"}` 可随时复核。
- 日志为按天切分的 JSONL，保留 14 天，敏感字段自动脱敏，内存环形缓冲供 `novel_tasks {action:"logs"}` 查询。

## 诊断

```
novel_tasks   {action:"status"}   # dart.available / runner / sources / dirs / recentLogCount
novel_tasks   {action:"logs", limit:50}
novel_library {action:"verify"}   # 全库完整性复核
```

`DART_UNAVAILABLE` 表示检索/详情仍可从本地索引工作，但下载需要编译 Dart 核心；参见 README「编译 Dart 核心」。

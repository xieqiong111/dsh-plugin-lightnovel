import path from 'node:path'
import Schema from '@deepseek-ai/schemastery'

/** Literal unions must mirror the Schemastery `Schema.union` values exactly. */
export type SearchMode = 'live' | 'local' | 'hybrid'
export type LogLevelName = 'debug' | 'info' | 'warn' | 'error'

/** User-facing plugin configuration, validated by Cordis before `apply` runs. */
export interface Config {
  /** Root for tasks, library, index and logs. Empty = $LN_DATA_DIR or ~/.local/share/dsh-plugin-lightnovel. */
  dataDir: string
  /** EPUB library directory. Empty = <dataDir>/library. */
  libraryDir: string
  /** Compiled Dart headless executable. Empty = auto-detect. */
  dartBinary: string
  /** Dart project root (the vendored bili_novel_packer). Empty = shipped vendor dir. */
  dartProjectDir: string
  /** Offline fixture root. Empty = shipped test fixtures. */
  fixturesDir: string
  /** Source ids enabled for search and download. wenku8 is opt-in. */
  enabledSources: string[]
  /** Search/index HTTP timeout. */
  searchTimeoutMs: number
  /** Minimum interval between two requests to the same host (politeness). */
  requestIntervalMs: number
  /** Per-task wall clock timeout. */
  taskTimeoutMs: number
  /** Simultaneous download jobs. */
  maxConcurrentDownloads: number
  /** Automatic + manual retry ceiling per task. */
  maxRetries: number
  /** Fetch and obey robots.txt before touching a source. */
  respectRobots: boolean
  /** Only use the offline fixture source. Useful for CI / NAS without egress. */
  offlineOnly: boolean
  /** Allow sources that may require a login (still never supplies credentials). */
  allowNonPublicSources: boolean
  /** live | local | hybrid */
  searchMode: SearchMode
  /** Polite, identifiable User-Agent. */
  userAgent: string
  /** Maximum volumes accepted by one download task. */
  maxVolumesPerTask: number
  /** Log level: debug | info | warn | error */
  logLevel: LogLevelName
  /** Extra traditional->simplified pairs, e.g. "臺台,裡里". */
  extraTraditionalMap: string
}

/** Runtime schema. Exported as `Config` because the Cordis loader looks it up. */
export const Config: Schema<Config> = Schema.object({
  dataDir: Schema.string().default(''),
  libraryDir: Schema.string().default(''),
  dartBinary: Schema.string().default(''),
  dartProjectDir: Schema.string().default(''),
  fixturesDir: Schema.string().default(''),
  enabledSources: Schema.array(String).default(['bilinovel', 'fixture']),
  searchTimeoutMs: Schema.number().default(15000),
  requestIntervalMs: Schema.number().default(4000),
  taskTimeoutMs: Schema.number().default(3600000),
  maxConcurrentDownloads: Schema.number().default(1),
  maxRetries: Schema.number().default(2),
  respectRobots: Schema.boolean().default(true),
  offlineOnly: Schema.boolean().default(false),
  allowNonPublicSources: Schema.boolean().default(false),
  searchMode: Schema.union(['live', 'local', 'hybrid']).default('hybrid'),
  userAgent: Schema.string().default('dsh-plugin-lightnovel/1.0 (+polite crawler; 1 request / 4s)'),
  maxVolumesPerTask: Schema.number().default(50),
  logLevel: Schema.union(['debug', 'info', 'warn', 'error']).default('info'),
  extraTraditionalMap: Schema.string().default(''),
})

export interface ResolvedConfig extends Config {
  tasksDir: string
  logsDir: string
  indexPath: string
}

/** Resolve environment-dependent defaults once, at load time. */
export function resolveConfig(config: Config, packageRoot: string, homedir: string): ResolvedConfig {
  const dataDir = config.dataDir || process.env.LN_DATA_DIR || path.join(homedir, '.local', 'share', 'dsh-plugin-lightnovel')
  return {
    ...config,
    dataDir,
    libraryDir: config.libraryDir || process.env.LN_LIBRARY_DIR || path.join(dataDir, 'library'),
    dartProjectDir: config.dartProjectDir || process.env.LN_DART_PROJECT_DIR || path.join(packageRoot, 'vendor', 'bili_novel_packer'),
    fixturesDir: config.fixturesDir || process.env.LN_FIXTURES_DIR || path.join(packageRoot, 'test', 'fixtures'),
    tasksDir: path.join(dataDir, 'tasks'),
    logsDir: path.join(dataDir, 'logs'),
    indexPath: path.join(dataDir, 'index', 'books.json'),
  }
}

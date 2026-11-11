import Schema from '@deepseek-ai/schemastery';
/** Literal unions must mirror the Schemastery `Schema.union` values exactly. */
export type SearchMode = 'live' | 'local' | 'hybrid';
export type LogLevelName = 'debug' | 'info' | 'warn' | 'error';
/** User-facing plugin configuration, validated by Cordis before `apply` runs. */
export interface Config {
    /** Root for tasks, library, index and logs. Empty = $LN_DATA_DIR or ~/.local/share/dsh-plugin-lightnovel. */
    dataDir: string;
    /** EPUB library directory. Empty = <dataDir>/library. */
    libraryDir: string;
    /** Compiled Dart headless executable. Empty = auto-detect. */
    dartBinary: string;
    /** Dart project root (the vendored bili_novel_packer). Empty = shipped vendor dir. */
    dartProjectDir: string;
    /** Offline fixture root. Empty = shipped test fixtures. */
    fixturesDir: string;
    /** Source ids enabled for search and download. wenku8 is opt-in. */
    enabledSources: string[];
    /** Search/index HTTP timeout. */
    searchTimeoutMs: number;
    /** Minimum interval between two requests to the same host (politeness). */
    requestIntervalMs: number;
    /** Per-task wall clock timeout. */
    taskTimeoutMs: number;
    /** Simultaneous download jobs. */
    maxConcurrentDownloads: number;
    /** Automatic + manual retry ceiling per task. */
    maxRetries: number;
    /** Fetch and obey robots.txt before touching a source. */
    respectRobots: boolean;
    /** Only use the offline fixture source. Useful for CI / NAS without egress. */
    offlineOnly: boolean;
    /** Allow sources that may require a login (still never supplies credentials). */
    allowNonPublicSources: boolean;
    /** live | local | hybrid */
    searchMode: SearchMode;
    /** Polite, identifiable User-Agent. */
    userAgent: string;
    /** Maximum volumes accepted by one download task. */
    maxVolumesPerTask: number;
    /** Log level: debug | info | warn | error */
    logLevel: LogLevelName;
    /** Extra traditional->simplified pairs, e.g. "臺台,裡里". */
    extraTraditionalMap: string;
}
/** Runtime schema. Exported as `Config` because the Cordis loader looks it up. */
export declare const Config: Schema<Config>;
export interface ResolvedConfig extends Config {
    tasksDir: string;
    logsDir: string;
    indexPath: string;
}
/** Resolve environment-dependent defaults once, at load time. */
export declare function resolveConfig(config: Config, packageRoot: string, homedir: string): ResolvedConfig;

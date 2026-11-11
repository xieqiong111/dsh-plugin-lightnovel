import path from 'node:path';
import Schema from '@deepseek-ai/schemastery';
/** Runtime schema. Exported as `Config` because the Cordis loader looks it up. */
export const Config = Schema.object({
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
});
/** Resolve environment-dependent defaults once, at load time. */
export function resolveConfig(config, packageRoot, homedir) {
    const dataDir = config.dataDir || process.env.LN_DATA_DIR || path.join(homedir, '.local', 'share', 'dsh-plugin-lightnovel');
    return {
        ...config,
        dataDir,
        libraryDir: config.libraryDir || process.env.LN_LIBRARY_DIR || path.join(dataDir, 'library'),
        dartProjectDir: config.dartProjectDir || process.env.LN_DART_PROJECT_DIR || path.join(packageRoot, 'vendor', 'bili_novel_packer'),
        fixturesDir: config.fixturesDir || process.env.LN_FIXTURES_DIR || path.join(packageRoot, 'test', 'fixtures'),
        tasksDir: path.join(dataDir, 'tasks'),
        logsDir: path.join(dataDir, 'logs'),
        indexPath: path.join(dataDir, 'index', 'books.json'),
    };
}
//# sourceMappingURL=config.js.map
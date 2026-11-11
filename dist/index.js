import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from './config.js';
import { PluginRuntime } from './runtime.js';
import { createLogger } from './util/logger.js';
import { registerNovelSearch } from './tools/novel-search.js';
import { registerNovelDetails } from './tools/novel-details.js';
import { registerNovelVolumes } from './tools/novel-volumes.js';
import { registerNovelDownload } from './tools/novel-download.js';
import { registerNovelTasks } from './tools/novel-tasks.js';
import { registerNovelLibrary } from './tools/novel-library.js';
/**
 * DeepSeek Harness / Cordis native plugin.
 *
 * The Cordis loader reads the `Config` schema (Standard Schema / Schemastery),
 * validates the patch row's config, then calls `apply(ctx, config)`. Everything
 * the plugin owns is created inside `apply` and released through `ctx.effect`,
 * so unloading / HMR leaves no timers, child processes or tool registrations.
 */
export const name = 'dsh-plugin-lightnovel';
export const inject = ['tools'];
// `Config` is a merged declaration in config.ts (interface + Schemastery schema);
// re-exporting it gives Cordis the schema value and consumers the type.
export { Config, resolveConfig } from './config.js';
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Derive the fully-resolved config once, shared by tests and apply(). */
export function resolve(config) {
    return resolveConfig(config, packageRoot, os.homedir());
}
export function apply(ctx, config) {
    const resolved = resolve(config);
    const logger = createLogger(resolved.logsDir, resolved.logLevel ?? 'info', process.env.LN_LOG_ECHO === 'true');
    const runtime = new PluginRuntime(resolved, logger);
    // Eager, non-blocking initialisation. Tools also await runtime.ready(), so a
    // slow probe never blocks tool registration and a failure is retryable.
    void runtime.init().catch((error) => {
        logger.error('plugin', 'init_failed', { error: String(error) });
    });
    // The six native tools (requirement #5). Registration is auto-tracked by
    // Cordis and removed on unload.
    registerNovelSearch(ctx, runtime);
    registerNovelDetails(ctx, runtime);
    registerNovelVolumes(ctx, runtime);
    registerNovelDownload(ctx, runtime);
    registerNovelTasks(ctx, runtime);
    registerNovelLibrary(ctx, runtime);
    // Reverse-order disposer; async disposers are awaited by the fiber.
    ctx.effect(() => () => runtime.dispose());
    logger.info('plugin', 'applied', {
        name,
        tools: ['novel_search', 'novel_details', 'novel_volumes', 'novel_download', 'novel_tasks', 'novel_library'],
        sources: resolved.enabledSources,
        searchMode: resolved.searchMode,
        offlineOnly: resolved.offlineOnly,
    });
}
//# sourceMappingURL=index.js.map
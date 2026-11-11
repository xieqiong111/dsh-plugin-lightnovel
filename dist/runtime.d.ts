import type { ResolvedConfig } from './config.js';
import { DartBridge } from './core/bridge.js';
import { Library } from './core/library.js';
import { NovelService } from './core/novel-service.js';
import { TaskStore } from './core/store.js';
import { TaskManager } from './core/tasks.js';
import { SearchEngine } from './search.js';
import { LocalIndex } from './sources/local-index.js';
import { SourceRegistry } from './sources/registry.js';
import { PoliteFetcher } from './util/http.js';
import type { Logger } from './util/logger.js';
/**
 * Owns every long-lived object of one plugin instance.
 *
 * Cordis disposes the whole fiber on unload/HMR, so all of these are created
 * inside `apply()` and released through `dispose()` — no module-level state.
 */
export declare class PluginRuntime {
    readonly config: ResolvedConfig;
    readonly logger: Logger;
    readonly fetcher: PoliteFetcher;
    readonly registry: SourceRegistry;
    readonly index: LocalIndex;
    readonly bridge: DartBridge;
    readonly store: TaskStore;
    readonly library: Library;
    readonly tasks: TaskManager;
    readonly search: SearchEngine;
    readonly novels: NovelService;
    private initPromise;
    private dartStatus;
    constructor(config: ResolvedConfig, logger: Logger);
    /** Idempotent, awaited by every tool before its first operation. */
    init(): Promise<void>;
    ready(): Promise<void>;
    private doInit;
    /** True once the Dart headless runner has been located. */
    get dartAvailable(): boolean;
    /** Diagnostics surfaced by `novel_tasks` / `novel_library` results. */
    status(): Record<string, unknown>;
    dispose(): Promise<void>;
}

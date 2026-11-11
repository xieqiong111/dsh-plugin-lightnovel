import type { ResolvedConfig } from '../config.js';
import type { DartBridge } from './bridge.js';
import type { Library } from './library.js';
import type { TaskStore } from './store.js';
import type { SourceRegistry } from '../sources/registry.js';
import type { DownloadRequest, TaskRecord, TaskState } from '../types.js';
import type { Logger } from '../util/logger.js';
/** Owns the download state machine: queue, progress, cancel, retry, recovery. */
export declare class TaskManager {
    private readonly config;
    private readonly store;
    private readonly bridge;
    private readonly library;
    private readonly registry;
    private readonly logger;
    private readonly active;
    private readonly queued;
    private disposed;
    constructor(config: ResolvedConfig, store: TaskStore, bridge: DartBridge, library: Library, registry: SourceRegistry, logger: Logger);
    init(): Promise<void>;
    get(id: string): TaskRecord | undefined;
    list(options?: {
        state?: TaskState;
        limit?: number;
    }): TaskRecord[];
    start(request: DownloadRequest): Promise<TaskRecord>;
    cancel(id: string): Promise<TaskRecord>;
    retry(id: string): Promise<TaskRecord>;
    dispose(): Promise<void>;
    private pump;
    private runTask;
    private applyProgress;
}
export declare class TaskManagerError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}

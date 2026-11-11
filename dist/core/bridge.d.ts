import type { ResolvedConfig } from '../config.js';
import type { BridgeEvent } from '../types.js';
import type { Logger } from '../util/logger.js';
export type DartCommand = 'details' | 'volumes' | 'pack';
export interface DartRequest {
    command: DartCommand;
    url: string;
    sourceId: string;
    allowedSources: string[];
    volumes?: string;
    outputDir?: string;
    combine?: boolean;
    addChapterTitle?: boolean;
    /** Written by the caller to request cooperative cancellation. */
    cancelFile?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    onProgress?: (event: BridgeEvent) => void;
}
export interface DartResult<T = Record<string, unknown>> {
    data: T;
    events: BridgeEvent[];
}
export declare class DartError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    constructor(code: string, message: string, retryable?: boolean);
}
/** Spawns the *original* Dart core through its new headless entry point. */
export declare class DartBridge {
    private readonly config;
    private readonly logger;
    constructor(config: ResolvedConfig, logger: Logger);
    probe(): Promise<{
        available: boolean;
        runner: string | null;
        reason?: string;
    }>;
    private resolveRunner;
    run<T = Record<string, unknown>>(request: DartRequest): Promise<DartResult<T>>;
}

import type { ResolvedConfig } from '../config.js';
import type { Logger } from '../util/logger.js';
import type { SourceAdapter, SourceInfo } from './types.js';
export declare class SourceRegistry {
    readonly all: readonly SourceAdapter[];
    readonly enabled: readonly SourceAdapter[];
    private readonly byId;
    constructor(config: ResolvedConfig, logger: Logger);
    get(id: string): SourceAdapter | undefined;
    /** Reject unknown/disabled sources before any book id is accepted. */
    requireEnabled(id: string): SourceAdapter;
    byDetailUrl(url: string): SourceAdapter | undefined;
    describe(): SourceInfo[];
    /** Allowed sources for the Dart process, always excluding restricted ones by default. */
    dartAllowedSources(config: ResolvedConfig): string[];
}
export declare class SourceError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}

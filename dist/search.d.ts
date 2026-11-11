import type { ResolvedConfig } from './config.js';
import type { SourceRegistry } from './sources/registry.js';
import type { SourceAdapter, SourceContext } from './sources/types.js';
import type { LocalIndex } from './sources/local-index.js';
import type { BookRecord, SearchHit, UpdateStatus } from './types.js';
import type { Logger } from './util/logger.js';
export interface SearchOptions {
    query: string;
    sources?: string[];
    status?: string;
    limit?: number;
    /** Re-run live source queries even when the local index already has hits. */
    refresh?: boolean;
}
export interface SearchOutcome {
    query: string;
    total: number;
    results: SearchHit[];
    sourcesQueried: string[];
    degradedSources: string[];
    sources: ReturnType<SourceRegistry['describe']>;
    tookMs: number;
}
export declare class SearchEngine {
    private readonly config;
    private readonly registry;
    private readonly index;
    private readonly ctx;
    private readonly logger;
    constructor(config: ResolvedConfig, registry: SourceRegistry, index: LocalIndex, ctx: SourceContext, logger: Logger);
    search(options: SearchOptions): Promise<SearchOutcome>;
}
/** Score, dedupe across sources and keep an `alsoAvailableOn` union. */
export declare function rank(books: BookRecord[], query: string, status: UpdateStatus | undefined, limit: number): SearchHit[];
/** Look up a book by id or detail URL; throws a typed error for tool callers. */
export declare function resolveBook(index: LocalIndex, registry: SourceRegistry, input: {
    bookId?: string;
    url?: string;
    source?: string;
}): {
    book: BookRecord;
    adapter: SourceAdapter;
};

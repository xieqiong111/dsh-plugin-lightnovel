import type { BookRecord } from '../types.js';
import type { Logger } from '../util/logger.js';
/**
 * Small persistent catalogue of books already seen (search hits and details).
 * It makes author/alias/variant search work even when a source's live search
 * endpoint is unavailable, and gives the NAS deployment an offline-capable
 * search path.
 */
export declare class LocalIndex {
    private readonly indexPath;
    private readonly logger;
    private books;
    private writeChain;
    private loaded;
    constructor(indexPath: string, logger: Logger);
    load(): Promise<void>;
    all(): BookRecord[];
    get(id: string): BookRecord | undefined;
    /** Resolve a `sourceId:bookId` id or a raw detail URL to an indexed record. */
    find(idOrUrl: string): BookRecord | undefined;
    upsert(book: BookRecord): Promise<void>;
    upsertMany(books: BookRecord[]): Promise<void>;
    private persist;
}

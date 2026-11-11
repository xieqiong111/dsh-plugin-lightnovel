import type { LibraryEntry, TaskArtifact } from '../types.js';
import type { Logger } from '../util/logger.js';
/** On-disk EPUB library with integrity verification and a portable index. */
export declare class Library {
    private readonly libraryDir;
    private readonly logger;
    private entries;
    private loaded;
    private chain;
    constructor(libraryDir: string, logger: Logger);
    private get indexPath();
    load(): Promise<void>;
    list(options?: {
        query?: string;
        limit?: number;
    }): LibraryEntry[];
    get(id: string): LibraryEntry | undefined;
    stats(): {
        total: number;
        bytes: number;
        chapters: number;
        ok: number;
        failed: number;
    };
    /** Copy one verified artefact into the library. Returns null on integrity failure. */
    add(input: {
        artifact: TaskArtifact;
        title: string;
        author: string;
        sourceId: string;
        bookId: string;
        taskId: string;
    }): Promise<LibraryEntry | null>;
    /** Re-verify a single entry or the whole library. */
    verify(id?: string): Promise<Array<{
        id: string;
        ok: boolean;
        problems: string[];
        sha256Changed: boolean;
    }>>;
    readChecksums(): Promise<string[]>;
    remove(id: string): Promise<boolean>;
    private persist;
}

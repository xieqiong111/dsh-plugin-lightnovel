import type { BookRecord } from '../types.js';
import type { SourceAdapter, SourceContext, SourceInfo } from './types.js';
/** Offline source. Reads `<fixturesDir>/books.json`; never performs network I/O. */
export declare class FixtureSourceAdapter implements SourceAdapter {
    readonly info: SourceInfo;
    readonly hosts: readonly string[];
    supportsDetailUrl(url: string): boolean;
    detailUrl(bookId: string): string;
    bookIdFromUrl(url: string): string | null;
    search(_query: string, ctx: SourceContext): Promise<BookRecord[]>;
}

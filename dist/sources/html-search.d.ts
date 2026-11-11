import type { BookRecord } from '../types.js';
export interface ParseSearchOptions {
    html: string;
    baseUrl: string;
    sourceId: string;
    sourceName: string;
    /** Must capture the source-local book id in group 1. */
    detailPattern: RegExp;
    canonicalDetailUrl: (bookId: string) => string;
    access: 'public' | 'restricted';
    limit: number;
}
/**
 * Tolerant parser for public search-result pages.
 *
 * Site markup changes often, so instead of hard-coding a single CSS selector we
 * walk every anchor whose href looks like a novel detail page, then climb a few
 * ancestors to collect cover/author/description/status. Anything we cannot
 * read is left null rather than guessed.
 */
export declare function parseSearchResults(options: ParseSearchOptions): BookRecord[];

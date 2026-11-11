import type { BookRecord } from '../types.js';
import type { SourceAdapter, SourceContext, SourceInfo } from './types.js';
export interface LiveSourceSpec {
    info: SourceInfo;
    hosts: readonly string[];
    baseUrl: string;
    /** `{q}` is replaced by the URL-encoded keyword. */
    searchUrlTemplate: string;
    detailPattern: RegExp;
    canonicalDetailUrl: (bookId: string) => string;
    /** Response charset for sites that still serve GBK pages. */
    encoding?: string;
}
/** Shared, rate-limited, robots-aware implementation for public search pages. */
export declare class LiveSearchAdapter implements SourceAdapter {
    readonly info: SourceInfo;
    readonly hosts: readonly string[];
    private readonly spec;
    constructor(spec: LiveSourceSpec);
    supportsDetailUrl(url: string): boolean;
    detailUrl(bookId: string): string;
    bookIdFromUrl(url: string): string | null;
    search(query: string, ctx: SourceContext): Promise<BookRecord[]>;
}
/** 哔哩轻小说 / linovelib — public pages only. */
export declare const biliNovelAdapter: LiveSearchAdapter;
/**
 * 轻小说文库 — opt-in. Some pages require a login; this plugin NEVER supplies
 * credentials or a session, so restricted content simply stays inaccessible.
 */
export declare const wenku8Adapter: LiveSearchAdapter;

import type { ResolvedConfig } from '../config.js';
import type { BookRecord, UpdateStatus } from '../types.js';
import type { PoliteFetcher } from '../util/http.js';
import type { Logger } from '../util/logger.js';
export interface SourceContext {
    config: ResolvedConfig;
    fetcher: PoliteFetcher;
    logger: Logger;
}
export interface SourceInfo {
    id: string;
    name: string;
    baseUrl: string;
    access: 'public' | 'restricted';
    live: boolean;
    note: string;
}
export interface SourceAdapter {
    readonly info: SourceInfo;
    /** Hosts this adapter is allowed to contact. */
    readonly hosts: readonly string[];
    /** True when `url` is a detail page this adapter can hand to the Dart core. */
    supportsDetailUrl(url: string): boolean;
    /** Canonical detail URL accepted by the Dart core for a given book id. */
    detailUrl(bookId: string): string;
    /** Extract the source-local book id from a detail URL. */
    bookIdFromUrl(url: string): string | null;
    /** Keyword search. Must only touch public pages and must be rate limited. */
    search(query: string, ctx: SourceContext): Promise<BookRecord[]>;
}
export declare function normalizeStatus(text: string | null | undefined): UpdateStatus;
export declare function absoluteUrl(href: string, baseUrl: string): string | null;

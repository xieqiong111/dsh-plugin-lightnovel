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
    /**
     * Only issue a live search request when the operator explicitly sets
     * `LN_<ID>_SEARCH_URL`. Some sites expose no robots-allowed public GET
     * keyword-search endpoint (only a POST form or a `*.php` route blocked by
     * robots.txt); hitting their "hot titles" landing page and reporting those
     * links as keyword hits would be misleading.
     */
    searchOptInOnly?: boolean;
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
/**
 * 哔哩轻小说 / linovelib — public pages only.
 *
 * Verified 2026-11-12 from the deployment host (direct egress, no proxy):
 *  - `www.bilinovel.com` does not complete a TLS handshake; `www.bilinovel.net`
 *    serves the same site and is the baseUrl already used by the vendored Dart
 *    `BiliNovelSource`, so all canonical URLs point there.
 *  - robots.txt (200) allows `/novel/...` and `/search.html`, but disallows
 *    `/*.php$`. The site's real keyword search is a POST form whose only
 *    working backend is a `.php` route, so keyword search is NOT crawled by
 *    default: `GET /search.html?keyword=...` returns a fixed "hot titles"
 *    landing page, not keyword results.
 *  - Detail, catalog, chapter and cover pages are public GETs and are fetched
 *    live by the Dart core. Set `LN_BILINOVEL_SEARCH_URL` only if the site later
 *    offers a robots-allowed public GET search endpoint.
 */
export declare const biliNovelAdapter: LiveSearchAdapter;
/**
 * 轻小说文库 — opt-in. Some pages require a login; this plugin NEVER supplies
 * credentials or a session, so restricted content simply stays inaccessible.
 */
export declare const wenku8Adapter: LiveSearchAdapter;

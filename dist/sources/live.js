import { parseSearchResults } from './html-search.js';
/** Shared, rate-limited, robots-aware implementation for public search pages. */
export class LiveSearchAdapter {
    info;
    hosts;
    spec;
    constructor(spec) {
        this.spec = spec;
        this.info = spec.info;
        this.hosts = spec.hosts;
    }
    supportsDetailUrl(url) {
        try {
            const parsed = new URL(url);
            const onHost = this.hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
            return onHost && this.spec.detailPattern.test(url);
        }
        catch {
            return false;
        }
    }
    detailUrl(bookId) {
        return this.spec.canonicalDetailUrl(bookId);
    }
    bookIdFromUrl(url) {
        const match = this.spec.detailPattern.exec(url);
        return match?.[1] ?? null;
    }
    async search(query, ctx) {
        if (ctx.config.offlineOnly)
            return [];
        const envKey = `LN_${this.info.id.toUpperCase()}_SEARCH_URL`;
        const override = process.env[envKey];
        if (this.spec.searchOptInOnly && !override) {
            // Honest degradation: no request is made and no "hot titles" links are
            // presented as keyword results. SearchEngine reports a degraded source.
            ctx.logger.info('source', 'live_search_opt_in_required', {
                sourceId: this.info.id,
                envKey,
                reason: 'no robots-allowed public GET keyword-search endpoint',
            });
            return [];
        }
        const template = override ?? this.spec.searchUrlTemplate;
        const target = template.replace('{q}', encodeURIComponent(query));
        let html;
        try {
            html = await ctx.fetcher.getText(target, {
                encoding: this.spec.encoding,
                allowedHosts: this.hosts,
            });
            ctx.logger.info('source', 'search_ok', { sourceId: this.info.id, target, bytes: html.length });
        }
        catch (error) {
            // Search is best-effort: one unreachable source must not break the whole
            // multi-source result. The caller reports it in `degradedSources`.
            ctx.logger.warn('source', 'search_failed', { sourceId: this.info.id, error: String(error) });
            return [];
        }
        return parseSearchResults({
            html,
            baseUrl: this.spec.baseUrl,
            sourceId: this.info.id,
            sourceName: this.info.name,
            detailPattern: this.spec.detailPattern,
            canonicalDetailUrl: this.spec.canonicalDetailUrl,
            access: this.info.access,
            limit: 20,
        });
    }
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
export const biliNovelAdapter = new LiveSearchAdapter({
    info: {
        id: 'bilinovel',
        name: '哔哩轻小说',
        baseUrl: 'https://www.bilinovel.net',
        access: 'public',
        live: true,
        note: 'Live public detail/catalog/chapter pages via the Dart core. Keyword search needs LN_BILINOVEL_SEARCH_URL opt-in (no robots-allowed GET search endpoint).',
    },
    hosts: ['bilinovel.com', 'bilinovel.net', 'linovelib.com'],
    baseUrl: 'https://www.bilinovel.net',
    searchUrlTemplate: 'https://www.bilinovel.net/search.html?keyword={q}',
    detailPattern: /(?:bilinovel\.(?:com|net)|linovelib\.com)\/(?:novel|download)\/(\d+)/,
    canonicalDetailUrl: (id) => `https://www.bilinovel.net/novel/${id}.html`,
    searchOptInOnly: true,
});
/**
 * 轻小说文库 — opt-in. Some pages require a login; this plugin NEVER supplies
 * credentials or a session, so restricted content simply stays inaccessible.
 */
export const wenku8Adapter = new LiveSearchAdapter({
    info: {
        id: 'wenku8',
        name: '轻小说文库',
        baseUrl: 'https://www.wenku8.net',
        access: 'restricted',
        live: true,
        note: 'Opt-in. Public search may be available; login-only pages are never accessed with credentials.',
    },
    hosts: ['wenku8.net'],
    baseUrl: 'https://www.wenku8.net',
    searchUrlTemplate: 'https://www.wenku8.net/modules/article/search.php?searchtype=articlename&searchkey={q}',
    detailPattern: /wenku8\.net\/book\/(\d+)\.htm/,
    canonicalDetailUrl: (id) => `https://www.wenku8.net/book/${id}.htm`,
    encoding: 'gbk',
});
//# sourceMappingURL=live.js.map
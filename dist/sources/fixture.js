import { readFile } from 'node:fs/promises';
import path from 'node:path';
const INFO = {
    id: 'fixture',
    name: '离线测试书源',
    baseUrl: 'fixture://local',
    access: 'public',
    live: false,
    note: 'Deterministic offline books + chapters used by automated tests and egress-free NAS installs.',
};
/** Offline source. Reads `<fixturesDir>/books.json`; never performs network I/O. */
export class FixtureSourceAdapter {
    info = INFO;
    hosts = [];
    supportsDetailUrl(url) {
        return url.startsWith('fixture://');
    }
    detailUrl(bookId) {
        return `fixture://novel/${encodeURIComponent(bookId)}.html`;
    }
    bookIdFromUrl(url) {
        const match = /^fixture:\/\/novel\/([^/]+?)\.html$/.exec(url);
        return match ? decodeURIComponent(match[1]) : null;
    }
    async search(_query, ctx) {
        const file = path.join(ctx.config.fixturesDir, 'books.json');
        let raw;
        try {
            raw = await readFile(file, 'utf8');
        }
        catch {
            ctx.logger.warn('fixture', 'books_missing', { file });
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        const now = new Date().toISOString();
        return parsed
            .filter((item) => typeof item === 'object' && item !== null)
            .map((item) => normaliseFixtureBook(item, now));
    }
}
function normaliseFixtureBook(item, now) {
    const bookId = String(item.bookId ?? item.id ?? 'unknown');
    return {
        id: String(item.id ?? `fixture:${bookId}`),
        sourceId: 'fixture',
        source: INFO.name,
        sourceUrl: String(item.sourceUrl ?? `fixture://novel/${bookId}.html`),
        bookId,
        title: String(item.title ?? bookId),
        aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
        author: String(item.author ?? '未知'),
        coverUrl: item.coverUrl == null ? null : String(item.coverUrl),
        description: item.description == null ? null : String(item.description),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        publisher: item.publisher == null ? null : String(item.publisher),
        statusText: String(item.statusText ?? '未知'),
        status: item.status === 'completed' || item.status === 'ongoing' ? item.status : 'unknown',
        lastUpdated: item.lastUpdated == null ? null : String(item.lastUpdated),
        volumeCount: typeof item.volumeCount === 'number' ? item.volumeCount : null,
        access: 'public',
        indexedAt: String(item.indexedAt ?? now),
    };
}
//# sourceMappingURL=fixture.js.map
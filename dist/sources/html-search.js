import { load } from 'cheerio';
import { absoluteUrl, normalizeStatus } from './types.js';
/**
 * Tolerant parser for public search-result pages.
 *
 * Site markup changes often, so instead of hard-coding a single CSS selector we
 * walk every anchor whose href looks like a novel detail page, then climb a few
 * ancestors to collect cover/author/description/status. Anything we cannot
 * read is left null rather than guessed.
 */
export function parseSearchResults(options) {
    const $ = load(options.html);
    const found = new Map();
    const now = new Date().toISOString();
    $('a[href]').each((_index, element) => {
        if (found.size >= options.limit * 3)
            return;
        const anchor = $(element);
        const href = anchor.attr('href');
        if (!href || /^(javascript|mailto|tel):/i.test(href))
            return;
        const absolute = absoluteUrl(href, options.baseUrl);
        if (!absolute)
            return;
        const match = options.detailPattern.exec(absolute);
        if (!match?.[1])
            return;
        const bookId = match[1];
        if (found.has(bookId))
            return;
        let title = anchor.text().replace(/\s+/g, ' ').trim();
        if (!title)
            title = (anchor.attr('title') ?? '').trim();
        if (!title || title.length > 120)
            title = `Book ${bookId}`;
        let container = anchor.parent();
        for (let level = 0; level < 3 && container.length > 0; level++) {
            const text = container.text().replace(/\s+/g, ' ').trim();
            if (text.length > title.length + 20)
                break;
            container = container.parent();
        }
        if (container.length === 0)
            container = anchor.parent();
        const text = container.text().replace(/\s+/g, ' ').trim();
        const img = container.find('img').first();
        const rawCover = img.attr('data-src') ?? img.attr('data-original') ?? img.attr('src') ?? null;
        const coverUrl = rawCover && !rawCover.startsWith('data:') ? absoluteUrl(rawCover, absolute) : null;
        const authorMatch = /作\s*者[:：]\s*([^\s,，|]{1,40})/.exec(text);
        const authorNode = container.find('[class*="author"], [class*="writer"]').first().text().trim();
        const author = authorNode.replace(/^作\s*者[:：]?/, '').trim() || authorMatch?.[1]?.trim() || '未知';
        const statusText = /(连载中|連載中|已完结|已完結|完本|未完结|更新中)/.exec(text)?.[1] ?? '';
        const description = container.find('[class*="desc"], [class*="intro"], [class*="summary"]').first().text().replace(/\s+/g, ' ').trim() || null;
        const tags = container.find('[class*="tag"] a, [class*="tag"] span').map((_i, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 12);
        found.set(bookId, {
            id: `${options.sourceId}:${bookId}`,
            sourceId: options.sourceId,
            source: options.sourceName,
            sourceUrl: options.canonicalDetailUrl(bookId),
            bookId,
            title,
            aliases: [],
            author,
            coverUrl,
            description: description && description.length > 600 ? description.slice(0, 600) : description,
            tags,
            publisher: null,
            statusText,
            status: normalizeStatus(statusText),
            lastUpdated: null,
            volumeCount: null,
            access: options.access,
            indexedAt: now,
        });
    });
    return [...found.values()].slice(0, options.limit * 3);
}
//# sourceMappingURL=html-search.js.map
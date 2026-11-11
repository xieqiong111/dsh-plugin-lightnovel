export function normalizeStatus(text) {
    if (!text)
        return 'unknown';
    if (/已完结|完結|全本|完本|completed|finished/i.test(text))
        return 'completed';
    if (/连载|連載|未完|ongoing|更新中/i.test(text))
        return 'ongoing';
    return 'unknown';
}
export function absoluteUrl(href, baseUrl) {
    try {
        return new URL(href, baseUrl).href;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=types.js.map
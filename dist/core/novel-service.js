import { resolveBook } from '../search.js';
import { normalizeStatus } from '../sources/types.js';
/** Details/volume reads reuse the vendored Dart scrapers through the bridge. */
export class NovelService {
    config;
    bridge;
    index;
    registry;
    logger;
    constructor(config, bridge, index, registry, logger) {
        this.config = config;
        this.bridge = bridge;
        this.index = index;
        this.registry = registry;
        this.logger = logger;
    }
    async details(reference, includeVolumes = false) {
        const { book, adapter } = resolveBook(this.index, this.registry, reference);
        const command = includeVolumes ? 'volumes' : 'details';
        const result = await this.bridge.run({
            command,
            url: book.sourceUrl,
            sourceId: adapter.info.id,
            allowedSources: this.registry.dartAllowedSources(this.config),
            timeoutMs: this.config.searchTimeoutMs,
        });
        const raw = result.data;
        const merged = this.mergeBook(book, raw.novel, adapter.info.id, adapter.info.name);
        const volumes = toVolumeSummaries(raw.volumes ?? []);
        await this.index.upsert({
            ...merged,
            volumeCount: raw.volumes ? volumes.length : merged.volumeCount,
        });
        const detail = {
            ...merged,
            volumeCount: volumes.length,
            chapterCount: volumes.reduce((sum, v) => sum + v.chapterCount, 0),
            volumes,
        };
        this.logger.info('novel', 'details', { bookId: merged.id, volumes: volumes.length, command });
        return { novel: detail, raw };
    }
    async volumes(reference) {
        const { book, adapter } = resolveBook(this.index, this.registry, reference);
        const result = await this.bridge.run({
            command: 'volumes',
            url: book.sourceUrl,
            sourceId: adapter.info.id,
            allowedSources: this.registry.dartAllowedSources(this.config),
            timeoutMs: this.config.searchTimeoutMs * 2,
        });
        const merged = this.mergeBook(book, result.data.novel, adapter.info.id, adapter.info.name);
        const volumes = (result.data.volumes ?? []).map((v, i) => {
            const chapters = (v.chapters ?? []).map((c) => ({
                name: String(c.name ?? `Chapter ${i + 1}`),
                url: c.url ?? null,
            }));
            return {
                index: v.index ?? i + 1,
                name: String(v.name ?? ''),
                cover: v.cover ?? null,
                chapterCount: v.chapterCount ?? chapters.length,
                chapters,
            };
        });
        await this.index.upsert({ ...merged, volumeCount: volumes.length });
        const totalChapters = volumes.reduce((sum, v) => sum + v.chapterCount, 0);
        this.logger.info('novel', 'volumes', { bookId: merged.id, volumes: volumes.length, chapters: totalChapters });
        return {
            novel: { ...merged, volumeCount: volumes.length, chapterCount: totalChapters, volumes: volumes.map(toSummary) },
            volumes,
            totalVolumes: volumes.length,
            totalChapters,
        };
    }
    mergeBook(base, raw, sourceId, sourceName) {
        if (!raw)
            return base;
        const statusText = String(raw.status ?? base.statusText);
        return {
            ...base,
            id: `${sourceId}:${raw.id ?? base.bookId}`,
            bookId: String(raw.id ?? base.bookId),
            sourceId,
            source: sourceName || raw.source || base.source,
            sourceUrl: raw.url ?? base.sourceUrl,
            title: String(raw.title ?? base.title),
            aliases: [...new Set([...base.aliases, ...(raw.alias ? [raw.alias] : [])])],
            author: String(raw.author ?? base.author),
            coverUrl: raw.coverUrl ?? base.coverUrl,
            description: raw.description ?? base.description,
            tags: raw.tags ?? base.tags,
            publisher: raw.publisher ?? base.publisher,
            statusText,
            status: normalizeStatus(statusText),
            indexedAt: new Date().toISOString(),
        };
    }
}
function toVolumeSummaries(volumes) {
    return volumes.map((v, i) => ({
        index: v.index ?? i + 1,
        name: String(v.name ?? ''),
        cover: v.cover ?? null,
        chapterCount: v.chapterCount ?? v.chapters?.length ?? 0,
    }));
}
function toSummary(v) {
    return { index: v.index, name: v.name, cover: v.cover, chapterCount: v.chapterCount };
}
//# sourceMappingURL=novel-service.js.map
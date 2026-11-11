import { atomicWriteJson, readJson } from '../util/json.js';
/**
 * Small persistent catalogue of books already seen (search hits and details).
 * It makes author/alias/variant search work even when a source's live search
 * endpoint is unavailable, and gives the NAS deployment an offline-capable
 * search path.
 */
export class LocalIndex {
    indexPath;
    logger;
    books = new Map();
    writeChain = Promise.resolve();
    loaded = false;
    constructor(indexPath, logger) {
        this.indexPath = indexPath;
        this.logger = logger;
    }
    async load() {
        if (this.loaded)
            return;
        this.loaded = true;
        const file = await readJson(this.indexPath, { version: 1, updatedAt: '', books: [] });
        for (const book of file.books ?? []) {
            if (book && typeof book.id === 'string')
                this.books.set(book.id, book);
        }
        this.logger.info('index', 'loaded', { count: this.books.size, path: this.indexPath });
    }
    all() {
        return [...this.books.values()];
    }
    get(id) {
        return this.books.get(id);
    }
    /** Resolve a `sourceId:bookId` id or a raw detail URL to an indexed record. */
    find(idOrUrl) {
        const direct = this.books.get(idOrUrl);
        if (direct)
            return direct;
        return this.all().find((book) => book.sourceUrl === idOrUrl);
    }
    async upsert(book) {
        await this.load();
        const existing = this.books.get(book.id);
        if (existing && JSON.stringify(existing) === JSON.stringify(book))
            return;
        this.books.set(book.id, { ...book, aliases: mergeAliases(existing?.aliases, book.aliases) });
        await this.persist();
    }
    async upsertMany(books) {
        if (books.length === 0)
            return;
        await this.load();
        let changed = false;
        for (const book of books) {
            const existing = this.books.get(book.id);
            const merged = { ...book, aliases: mergeAliases(existing?.aliases, book.aliases) };
            if (JSON.stringify(existing) !== JSON.stringify(merged)) {
                this.books.set(book.id, merged);
                changed = true;
            }
        }
        if (changed)
            await this.persist();
    }
    persist() {
        const snapshot = {
            version: 1,
            updatedAt: new Date().toISOString(),
            books: [...this.books.values()],
        };
        this.writeChain = this.writeChain
            .catch(() => undefined)
            .then(() => atomicWriteJson(this.indexPath, snapshot))
            .catch((error) => this.logger.error('index', 'persist_failed', { error: String(error) }));
        return this.writeChain;
    }
}
function mergeAliases(left, right) {
    return [...new Set([...(left ?? []), ...(right ?? [])])].filter(Boolean);
}
//# sourceMappingURL=local-index.js.map
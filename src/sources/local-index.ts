import type { BookRecord } from '../types.js'
import { atomicWriteJson, readJson } from '../util/json.js'
import type { Logger } from '../util/logger.js'

interface IndexFile {
  version: 1
  updatedAt: string
  books: BookRecord[]
}

/**
 * Small persistent catalogue of books already seen (search hits and details).
 * It makes author/alias/variant search work even when a source's live search
 * endpoint is unavailable, and gives the NAS deployment an offline-capable
 * search path.
 */
export class LocalIndex {
  private books = new Map<string, BookRecord>()
  private writeChain: Promise<void> = Promise.resolve()
  private loaded = false

  constructor(private readonly indexPath: string, private readonly logger: Logger) {}

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    const file = await readJson<IndexFile>(this.indexPath, { version: 1, updatedAt: '', books: [] })
    for (const book of file.books ?? []) {
      if (book && typeof book.id === 'string') this.books.set(book.id, book)
    }
    this.logger.info('index', 'loaded', { count: this.books.size, path: this.indexPath })
  }

  all(): BookRecord[] {
    return [...this.books.values()]
  }

  get(id: string): BookRecord | undefined {
    return this.books.get(id)
  }

  /** Resolve a `sourceId:bookId` id or a raw detail URL to an indexed record. */
  find(idOrUrl: string): BookRecord | undefined {
    const direct = this.books.get(idOrUrl)
    if (direct) return direct
    return this.all().find((book) => book.sourceUrl === idOrUrl)
  }

  async upsert(book: BookRecord): Promise<void> {
    await this.load()
    const existing = this.books.get(book.id)
    if (existing && JSON.stringify(existing) === JSON.stringify(book)) return
    this.books.set(book.id, { ...book, aliases: mergeAliases(existing?.aliases, book.aliases) })
    await this.persist()
  }

  async upsertMany(books: BookRecord[]): Promise<void> {
    if (books.length === 0) return
    await this.load()
    let changed = false
    for (const book of books) {
      const existing = this.books.get(book.id)
      const merged = { ...book, aliases: mergeAliases(existing?.aliases, book.aliases) }
      if (JSON.stringify(existing) !== JSON.stringify(merged)) {
        this.books.set(book.id, merged)
        changed = true
      }
    }
    if (changed) await this.persist()
  }

  private persist(): Promise<void> {
    const snapshot: IndexFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      books: [...this.books.values()],
    }
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(() => atomicWriteJson(this.indexPath, snapshot))
      .catch((error) => this.logger.error('index', 'persist_failed', { error: String(error) }))
    return this.writeChain
  }
}

function mergeAliases(left?: string[], right?: string[]): string[] {
  return [...new Set([...(left ?? []), ...(right ?? [])])].filter(Boolean)
}

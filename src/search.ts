import type { ResolvedConfig } from './config.js'
import type { SourceRegistry } from './sources/registry.js'
import type { SourceAdapter, SourceContext } from './sources/types.js'
import type { LocalIndex } from './sources/local-index.js'
import type { BookRecord, SearchHit, UpdateStatus } from './types.js'
import { ensureChinese, normalizeText, scoreBook } from './util/chinese.js'
import type { Logger } from './util/logger.js'

export interface SearchOptions {
  query: string
  sources?: string[]
  status?: string
  limit?: number
  /** Re-run live source queries even when the local index already has hits. */
  refresh?: boolean
}

export interface SearchOutcome {
  query: string
  total: number
  results: SearchHit[]
  sourcesQueried: string[]
  degradedSources: string[]
  sources: ReturnType<SourceRegistry['describe']>
  tookMs: number
}

export class SearchEngine {
  constructor(
    private readonly config: ResolvedConfig,
    private readonly registry: SourceRegistry,
    private readonly index: LocalIndex,
    private readonly ctx: SourceContext,
    private readonly logger: Logger,
  ) {}

  async search(options: SearchOptions): Promise<SearchOutcome> {
    const started = Date.now()
    await ensureChinese(this.config.extraTraditionalMap)
    const query = options.query.trim()
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 50)
    const startedSources: string[] = []
    const degraded: string[] = []
    const candidates: BookRecord[] = []

    const wantedSources = options.sources?.length
      ? options.sources
      : this.registry.enabled.map((s) => s.info.id)
    const allowed = new Set(wantedSources)

    if (this.config.searchMode !== 'live') {
      await this.index.load()
      candidates.push(...this.index.all().filter((book) => allowed.has(book.sourceId)))
      startedSources.push('local-index')
    }

    const localHits = candidates.length
    const shouldGoLive = this.config.searchMode !== 'local'
      && (options.refresh === true || localHits === 0 || this.config.searchMode === 'live')

    if (shouldGoLive && query) {
      const live = this.registry.enabled.filter((s) => allowed.has(s.info.id) && s.info.live)
      const outcomes = await Promise.allSettled(live.map(async (adapter) => {
        startedSources.push(adapter.info.id)
        const books = await adapter.search(query, this.ctx)
        if (books.length === 0 && adapter.info.live) degraded.push(adapter.info.id)
        return books
      }))
      for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled') candidates.push(...outcome.value)
        else this.logger.warn('search', 'source_rejected', { error: String(outcome.reason) })
      }
      // Offline sources are still queried so egress-free setups work.
      for (const adapter of this.registry.enabled.filter((s) => allowed.has(s.info.id) && !s.info.live)) {
        startedSources.push(adapter.info.id)
        candidates.push(...await adapter.search(query, this.ctx))
      }
      await this.index.upsertMany(candidates.filter((book) => book.sourceId !== 'local-index'))
    }

    const statusFilter = parseStatus(options.status)
    const scored = rank(candidates, query, statusFilter, limit)
    return {
      query,
      total: scored.length,
      results: scored,
      sourcesQueried: [...new Set(startedSources)],
      degradedSources: [...new Set(degraded)],
      sources: this.registry.describe(),
      tookMs: Date.now() - started,
    }
  }
}

function parseStatus(raw?: string): UpdateStatus | undefined {
  if (!raw) return undefined
  if (raw === 'ongoing' || raw === 'completed' || raw === 'unknown') return raw
  if (/连载|連載/.test(raw)) return 'ongoing'
  if (/完结|完結/.test(raw)) return 'completed'
  return undefined
}

/** Score, dedupe across sources and keep an `alsoAvailableOn` union. */
export function rank(books: BookRecord[], query: string, status: UpdateStatus | undefined, limit: number): SearchHit[] {
  const groups = new Map<string, SearchHit>()
  for (const book of books) {
    if (status && book.status !== status) continue
    const { score, matchedBy } = scoreBook(query, {
      title: book.title,
      aliases: book.aliases,
      author: book.author,
      tags: book.tags,
      description: book.description,
    })
    if (query && score < 20) continue
    const key = `${normalizeText(book.title)}|${normalizeText(book.author)}`
    const hit: SearchHit = { ...book, score: query ? score : 100, matchedBy, alsoAvailableOn: [] }
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, hit)
      continue
    }
    existing.alsoAvailableOn.push(`${book.sourceId}:${book.bookId}`)
    // Prefer the richer record, then the higher score, then public access.
    const richer = recordQuality(hit) > recordQuality(existing)
    if (richer || (recordQuality(hit) === recordQuality(existing) && hit.score > existing.score)) {
      hit.alsoAvailableOn = [...new Set([...existing.alsoAvailableOn, `${existing.sourceId}:${existing.bookId}`])]
      groups.set(key, hit)
    }
  }
  return [...groups.values()]
    .map((hit) => ({ ...hit, alsoAvailableOn: hit.alsoAvailableOn.filter((id) => id !== `${hit.sourceId}:${hit.bookId}`) }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'zh-Hans-CN'))
    .slice(0, limit)
}

function recordQuality(book: BookRecord): number {
  let score = 0
  if (book.coverUrl) score += 2
  if (book.description) score += 2
  if (book.aliases.length > 0) score += 1
  if (book.status !== 'unknown') score += 1
  if (book.access === 'public') score += 1
  return score
}

/** Look up a book by id or detail URL; throws a typed error for tool callers. */
export function resolveBook(
  index: LocalIndex,
  registry: SourceRegistry,
  input: { bookId?: string; url?: string; source?: string },
): { book: BookRecord; adapter: SourceAdapter } {
  const raw = (input.bookId ?? input.url ?? '').trim()
  if (!raw) throw new Error('EMPTY_BOOK_REFERENCE: provide bookId or url')
  const indexed = index.find(raw)
  if (indexed) {
    return { book: indexed, adapter: registry.requireEnabled(indexed.sourceId) }
  }
  if (/^https?:\/\//.test(raw)) {
    const adapter = registry.byDetailUrl(raw)
    if (!adapter) throw new Error(`UNSUPPORTED_URL: ${raw}`)
    const bookId = adapter.bookIdFromUrl(raw)
    if (!bookId) throw new Error(`UNSUPPORTED_URL: ${raw}`)
    return {
      adapter: registry.requireEnabled(adapter.info.id),
      book: emptyBook(adapter, bookId, adapter.detailUrl(bookId)),
    }
  }
  const [sourceId, ...rest] = raw.split(':')
  const bookId = rest.join(':')
  if (sourceId && bookId) {
    const adapter = registry.requireEnabled(sourceId)
    return { adapter, book: emptyBook(adapter, bookId, adapter.detailUrl(bookId)) }
  }
  throw new Error(`BOOK_NOT_FOUND: ${raw}`)
}

function emptyBook(adapter: SourceAdapter, bookId: string, url: string): BookRecord {
  return {
    id: `${adapter.info.id}:${bookId}`,
    sourceId: adapter.info.id,
    source: adapter.info.name,
    sourceUrl: url,
    bookId,
    title: `Book ${bookId}`,
    aliases: [],
    author: '未知',
    coverUrl: null,
    description: null,
    tags: [],
    publisher: null,
    statusText: '未知',
    status: 'unknown',
    lastUpdated: null,
    volumeCount: null,
    access: adapter.info.access,
    indexedAt: new Date().toISOString(),
  }
}

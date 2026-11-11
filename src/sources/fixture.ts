import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { BookRecord } from '../types.js'
import type { SourceAdapter, SourceContext, SourceInfo } from './types.js'

const INFO: SourceInfo = {
  id: 'fixture',
  name: '离线测试书源',
  baseUrl: 'fixture://local',
  access: 'public',
  live: false,
  note: 'Deterministic offline books + chapters used by automated tests and egress-free NAS installs.',
}

/** Offline source. Reads `<fixturesDir>/books.json`; never performs network I/O. */
export class FixtureSourceAdapter implements SourceAdapter {
  readonly info = INFO
  readonly hosts: readonly string[] = []

  supportsDetailUrl(url: string): boolean {
    return url.startsWith('fixture://')
  }

  detailUrl(bookId: string): string {
    return `fixture://novel/${encodeURIComponent(bookId)}.html`
  }

  bookIdFromUrl(url: string): string | null {
    const match = /^fixture:\/\/novel\/([^/]+?)\.html$/.exec(url)
    return match ? decodeURIComponent(match[1]!) : null
  }

  async search(_query: string, ctx: SourceContext): Promise<BookRecord[]> {
    const file = path.join(ctx.config.fixturesDir, 'books.json')
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch {
      ctx.logger.warn('fixture', 'books_missing', { file })
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = new Date().toISOString()
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => normaliseFixtureBook(item, now))
  }
}

function normaliseFixtureBook(item: Record<string, unknown>, now: string): BookRecord {
  const bookId = String(item.bookId ?? item.id ?? 'unknown')
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
  }
}

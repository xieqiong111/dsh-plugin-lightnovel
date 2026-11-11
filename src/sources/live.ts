import type { BookRecord } from '../types.js'
import { parseSearchResults } from './html-search.js'
import type { SourceAdapter, SourceContext, SourceInfo } from './types.js'

export interface LiveSourceSpec {
  info: SourceInfo
  hosts: readonly string[]
  baseUrl: string
  /** `{q}` is replaced by the URL-encoded keyword. */
  searchUrlTemplate: string
  detailPattern: RegExp
  canonicalDetailUrl: (bookId: string) => string
  /** Response charset for sites that still serve GBK pages. */
  encoding?: string
}

/** Shared, rate-limited, robots-aware implementation for public search pages. */
export class LiveSearchAdapter implements SourceAdapter {
  readonly info: SourceInfo
  readonly hosts: readonly string[]
  private readonly spec: LiveSourceSpec

  constructor(spec: LiveSourceSpec) {
    this.spec = spec
    this.info = spec.info
    this.hosts = spec.hosts
  }

  supportsDetailUrl(url: string): boolean {
    try {
      const parsed = new URL(url)
      const onHost = this.hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))
      return onHost && this.spec.detailPattern.test(url)
    } catch {
      return false
    }
  }

  detailUrl(bookId: string): string {
    return this.spec.canonicalDetailUrl(bookId)
  }

  bookIdFromUrl(url: string): string | null {
    const match = this.spec.detailPattern.exec(url)
    return match?.[1] ?? null
  }

  async search(query: string, ctx: SourceContext): Promise<BookRecord[]> {
    if (ctx.config.offlineOnly) return []
    const template = process.env[`LN_${this.info.id.toUpperCase()}_SEARCH_URL`] ?? this.spec.searchUrlTemplate
    const target = template.replace('{q}', encodeURIComponent(query))
    let html: string
    try {
      html = await ctx.fetcher.getText(target, {
        encoding: this.spec.encoding,
        allowedHosts: this.hosts,
      })
      ctx.logger.info('source', 'search_ok', { sourceId: this.info.id, target, bytes: html.length })
    } catch (error) {
      // Search is best-effort: one unreachable source must not break the whole
      // multi-source result. The caller reports it in `degradedSources`.
      ctx.logger.warn('source', 'search_failed', { sourceId: this.info.id, error: String(error) })
      return []
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
    })
  }
}

/** 哔哩轻小说 / linovelib — public pages only. */
export const biliNovelAdapter = new LiveSearchAdapter({
  info: {
    id: 'bilinovel',
    name: '哔哩轻小说',
    baseUrl: 'https://www.bilinovel.com',
    access: 'public',
    live: true,
    note: 'Public search + detail pages. Download is handled by the vendored Dart BiliNovelSource.',
  },
  hosts: ['bilinovel.com', 'bilinovel.net', 'linovelib.com'],
  baseUrl: 'https://www.bilinovel.com',
  searchUrlTemplate: 'https://www.bilinovel.com/search/?keyword={q}',
  detailPattern: /(?:bilinovel\.(?:com|net)|linovelib\.com)\/(?:novel|download)\/(\d+)/,
  canonicalDetailUrl: (id) => `https://www.bilinovel.com/novel/${id}.html`,
})

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
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { biliNovelAdapter, wenku8Adapter } from '../../src/sources/live.js'
import { Config, resolveConfig } from '../../src/config.js'
import { createLogger } from '../../src/util/logger.js'
import type { SourceContext } from '../../src/sources/types.js'
import type { PoliteFetcher } from '../../src/util/http.js'

const config = resolveConfig(Config({ offlineOnly: false }), '/pkg', '/home/test')
const logger = createLogger('/tmp/ln-test-logs')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function makeContext(getText: (url: string, options?: unknown) => Promise<string>): SourceContext {
  return {
    config,
    logger,
    fetcher: { getText } as unknown as PoliteFetcher,
  }
}

describe('bilinovel live adapter — reachable canonical host', () => {
  it('uses the reachable .net origin for baseUrl and canonical detail URLs', () => {
    expect(biliNovelAdapter.info.baseUrl).toBe('https://www.bilinovel.net')
    expect(biliNovelAdapter.detailUrl('2059')).toBe('https://www.bilinovel.net/novel/2059.html')
    expect(biliNovelAdapter.info.note).toMatch(/LN_BILINOVEL_SEARCH_URL/)
  })

  it('accepts legacy .com / linovelib links but rejects unrelated hosts', () => {
    expect(biliNovelAdapter.bookIdFromUrl('https://www.bilinovel.com/novel/2059.html')).toBe('2059')
    expect(biliNovelAdapter.bookIdFromUrl('https://tw.linovelib.com/novel/2059.html')).toBe('2059')
    expect(biliNovelAdapter.supportsDetailUrl('https://www.bilinovel.net/download/2059.html')).toBe(true)
    expect(biliNovelAdapter.supportsDetailUrl('https://example.com/novel/2059.html')).toBe(false)
  })

  it('keeps restricted sources explicitly marked', () => {
    expect(wenku8Adapter.info.access).toBe('restricted')
    expect(wenku8Adapter.detailUrl('1')).toBe('https://www.wenku8.net/book/1.htm')
  })
})

describe('bilinovel live adapter — honest keyword-search opt-in', () => {
  it('makes NO request when no robots-allowed GET search endpoint is configured', async () => {
    vi.stubEnv('LN_BILINOVEL_SEARCH_URL', undefined)
    const getText = vi.fn(async () => '<html><a href="/novel/2059.html">安达与岛村</a></html>')
    const books = await biliNovelAdapter.search('安达与岛村', makeContext(getText))
    expect(books).toEqual([])
    expect(getText).not.toHaveBeenCalled()
  })

  it('does not crawl anything in offlineOnly mode', async () => {
    const offline = { ...config, offlineOnly: true }
    const getText = vi.fn(async () => '<html></html>')
    await biliNovelAdapter.search('x', { config: offline, logger, fetcher: { getText } as unknown as PoliteFetcher })
    expect(getText).not.toHaveBeenCalled()
  })

  it('uses the operator override and parses real detail links when opted in', async () => {
    vi.stubEnv('LN_BILINOVEL_SEARCH_URL', 'https://www.bilinovel.net/find.html?keyword={q}')
    const getText = vi.fn(async () => `
      <html><body><div class="result">
        <a href="/novel/2059.html">安达与岛村</a>
        <img data-src="/cover/2059.jpg">
        <span class="author">入间人间</span>
        <span class="desc">高一女学生安达与岛村是好朋友。</span>
      </div></body></html>`)
    const books = await biliNovelAdapter.search('安达 岛村', makeContext(getText))
    expect(getText).toHaveBeenCalledTimes(1)
    expect(getText.mock.calls[0]![0]).toBe('https://www.bilinovel.net/find.html?keyword=%E5%AE%89%E8%BE%BE%20%E5%B2%9B%E6%9D%91')
    expect(books).toHaveLength(1)
    expect(books[0]).toMatchObject({
      id: 'bilinovel:2059',
      bookId: '2059',
      sourceId: 'bilinovel',
      sourceUrl: 'https://www.bilinovel.net/novel/2059.html',
      title: '安达与岛村',
      access: 'public',
    })
  })

  it('degrades gracefully when a live search request fails', async () => {
    vi.stubEnv('LN_BILINOVEL_SEARCH_URL', 'https://www.bilinovel.net/find.html?keyword={q}')
    const getText = vi.fn(async () => { throw new Error('HTTP 503') })
    const books = await biliNovelAdapter.search('x', makeContext(getText))
    expect(books).toEqual([])
  })
})

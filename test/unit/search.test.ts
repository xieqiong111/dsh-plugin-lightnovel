import { beforeAll, describe, expect, it } from 'vitest'
import { rank, resolveBook } from '../../src/search.js'
import { ensureChinese } from '../../src/util/chinese.js'
import { LocalIndex } from '../../src/sources/local-index.js'
import { SourceRegistry } from '../../src/sources/registry.js'
import { Config, resolveConfig } from '../../src/config.js'
import { createLogger } from '../../src/util/logger.js'
import type { BookRecord } from '../../src/types.js'
import path from 'node:path'

beforeAll(async () => { await ensureChinese() })

const base: Omit<BookRecord, 'id' | 'title' | 'sourceId' | 'bookId' | 'sourceUrl'> = {
  source: '测试源', aliases: [], author: '测试作者', coverUrl: null, description: null,
  tags: [], publisher: null, statusText: '连载中', status: 'ongoing', lastUpdated: null,
  volumeCount: null, access: 'public', indexedAt: '2026-01-01T00:00:00.000Z',
}

function book(partial: Partial<BookRecord> = {}): BookRecord {
  return {
    ...base,
    id: 'fixture:one', sourceId: 'fixture', bookId: 'one',
    sourceUrl: 'fixture://novel/one.html', title: '星海旅途',
    ...partial,
  }
}

function testRegistry(offlineOnly = true) {
  const config = resolveConfig(Config({ offlineOnly }), '/pkg', '/home/test')
  return new SourceRegistry(config, createLogger('/tmp/ln-test-logs'))
}

describe('rank(): multi-source normalisation and dedupe (requirement #4)', () => {
  it('returns uniform structured fields and a relevance score', () => {
    const [hit] = rank([book()], '星海旅途', undefined, 10)
    expect(hit).toMatchObject({
      id: 'fixture:one', title: '星海旅途', author: '测试作者', source: '测试源',
      sourceUrl: 'fixture://novel/one.html', statusText: '连载中', status: 'ongoing',
    })
    expect(hit!.score).toBe(100)
    expect(hit!.matchedBy).toContain('title')
    expect(hit!.alsoAvailableOn).toEqual([])
  })

  it('deduplicates the same book across sources, keeping the richer record', () => {
    const lean = book({ sourceId: 'a', id: 'a:1', bookId: '1', coverUrl: null, description: null })
    const rich = book({ sourceId: 'b', id: 'b:9', bookId: '9', coverUrl: 'https://x/c.jpg', description: '简介' })
    const hits = rank([lean, rich], '星海旅途', undefined, 10)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.coverUrl).toBe('https://x/c.jpg')
    expect(hits[0]!.alsoAvailableOn).toContain('a:1')
  })

  it('filters by update status', () => {
    expect(rank([book({ status: 'ongoing' })], '', 'completed', 10)).toHaveLength(0)
    expect(rank([book({ status: 'ongoing' })], '', 'ongoing', 10)).toHaveLength(1)
  })

  it('drops low-relevance hits and respects limit', () => {
    const many = Array.from({ length: 5 }, (_, i) => book({ id: `fixture:${i}`, bookId: `${i}`, title: `星海旅途 第${i}部` }))
    expect(rank(many, '完全不相关的关键词', undefined, 50)).toHaveLength(0)
    expect(rank(many, '星海旅途', undefined, 2)).toHaveLength(2)
  })
})

describe('resolveBook()', () => {
  it('resolves bookId, sourceUrl and sourceId:bookId pairs', async () => {
    const index = new LocalIndex(path.join('/tmp/ln-test-index', 'books.json'), createLogger('/tmp/ln-test-logs'))
    await index.upsert(book())
    const registry = testRegistry()
    expect(resolveBook(index, registry, { bookId: 'fixture:one' }).book.title).toBe('星海旅途')
    expect(resolveBook(index, registry, { url: 'fixture://novel/one.html' }).book.title).toBe('星海旅途')
    const byPair = resolveBook(index, registry, { bookId: 'fixture:another' })
    expect(byPair.adapter.info.id).toBe('fixture')
    expect(byPair.book.bookId).toBe('another')
  })

  it('rejects empty and unsupported references', async () => {
    const index = new LocalIndex('/tmp/ln-test-index/books2.json', createLogger('/tmp/ln-test-logs'))
    const registry = testRegistry()
    expect(() => resolveBook(index, registry, {})).toThrow(/EMPTY_BOOK_REFERENCE/)
    expect(() => resolveBook(index, registry, { url: 'https://unrelated.example.com/x' })).toThrow(/UNSUPPORTED_URL/)
  })

  it('refuses a disabled source', async () => {
    const index = new LocalIndex('/tmp/ln-test-index/books3.json', createLogger('/tmp/ln-test-logs'))
    await index.upsert(book({ sourceId: 'wenku8', id: 'wenku8:1', sourceUrl: 'https://www.wenku8.net/book/1.htm' }))
    const registry = testRegistry()
    expect(() => resolveBook(index, registry, { bookId: 'wenku8:1' })).toThrow(/not enabled/)
  })
})

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createApi } from '../../server/api.mjs'
import { createBangumiKomga } from '../../server/bangumi-komga.mjs'
import { createKomgaClient } from '../../server/komga-client.mjs'

const subject = { id: 123, name: 'テスト', nameCn: '测试作品' }
const seriesInput = { kind: 'manga', scope: 'series', seriesId: 'series-a', subjectId: subject.id }

function fixture() {
  const state = {
    title: '本地标题', summary: '本地简介', summaryLock: true, tags: ['收藏'],
    links: [{ label: '来源', url: 'https://example.invalid/source' }],
  }
  const book = {
    title: '第 1 卷', number: '1', numberSort: 1, summary: '', authors: [{ name: '译者', role: 'translator' }],
  }
  const patchSeries = vi.fn()
  const patchBook = vi.fn()
  const komga = createKomgaClient({ url: 'http://komga:25600', apiKey: 'komga-fixture-key' }, {
    fetchImpl: async (url: string, init: RequestInit) => {
      expect(init.redirect).toBe('error')
      expect(init.headers).toMatchObject({ 'X-API-Key': 'komga-fixture-key' })
      if (url.endsWith('/series/series-a')) return Response.json({ id: 'series-a', name: '系列', metadata: state })
      if (url.endsWith('/books/book-a')) return Response.json({ id: 'book-a', name: '卷', seriesId: 'series-a', metadata: book })
      if (url.endsWith('/series/series-a/metadata') && init.method === 'PATCH') {
        patchSeries(JSON.parse(String(init.body)))
        return new Response(null, { status: 204 })
      }
      if (url.endsWith('/books/book-a/metadata') && init.method === 'PATCH') {
        patchBook(JSON.parse(String(init.body)))
        return new Response(null, { status: 204 })
      }
      if (url.includes('/books/list?') && init.method === 'POST') {
        expect(JSON.parse(String(init.body)).condition.allOf[0]).toEqual({ seriesId: { operator: 'is', value: 'series-a' } })
        return Response.json({ content: [{ id: 'book-a', name: '卷', seriesId: 'series-a', metadata: book }], number: 0, last: true })
      }
      return new Response(null, { status: 404 })
    },
  })
  const adapterFetch = vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input)
    expect(init.redirect).toBe('error')
    expect(url.origin).toBe('http://bangumikomga:8091')
    expect(init.headers).not.toHaveProperty('authorization')
    if (url.pathname === '/search') return Response.json({ candidates: [subject] })
    const scope = url.searchParams.get('scope')
    const metadata = scope === 'series'
      ? { title: '测试作品', summary: '刮削简介', tags: ['奇幻'], titleSort: 'ignored' }
      : { summary: '本卷简介', number: '99', numberSort: 99, authors: [{ name: '作者', role: 'writer' }] }
    return Response.json({ subject, metadata })
  })
  const run = createBangumiKomga({ url: 'http://bangumikomga:8091', komga: () => komga, fetchImpl: adapterFetch })
  return { run, state, adapterFetch, patchSeries, patchBook }
}

describe('BangumiKomga metadata', () => {
  it('finds candidates and writes an individually approved series while respecting locked fields', async () => {
    const { run, patchSeries } = fixture()
    expect(await run('search', { kind: 'manga', scope: 'series', query: '測試作品' })).toMatchObject({
      candidates: [{ id: subject.id, nameCn: subject.nameCn }],
    })
    const preview = await run('preview', seriesInput)
    expect(preview.changes).toMatchObject({ title: { before: '本地标题', after: '测试作品' } })
    expect(preview.changes).not.toHaveProperty('summary')
    expect(patchSeries).not.toHaveBeenCalled()
    expect(await run('apply', { previewId: preview.previewId })).toMatchObject({ updated: true })
    expect(patchSeries).toHaveBeenCalledOnce()
    expect(patchSeries).toHaveBeenCalledWith({
      title: '测试作品', tags: ['收藏', '奇幻'], links: [
        { label: '来源', url: 'https://example.invalid/source' },
        { label: 'Bangumi', url: 'https://bgm.tv/subject/123' },
      ],
    })
    await expect(run('apply', { previewId: preview.previewId })).rejects.toMatchObject({ code: 'METADATA_PREVIEW_EXPIRED' })
  })

  it('lists books, checks series ownership, and updates a single novel volume without reordering it', async () => {
    const { run, patchBook } = fixture()
    expect(await run('books', { seriesId: 'series-a' })).toMatchObject({ books: [{ id: 'book-a', number: '1' }] })
    const input = { ...seriesInput, kind: 'novel', scope: 'book', bookId: 'book-a' }
    await expect(run('preview', { ...input, seriesId: 'other' })).rejects.toMatchObject({ code: 'BOOK_SERIES_MISMATCH' })
    const preview = await run('preview', input)
    await run('apply', { previewId: preview.previewId })
    expect(patchBook).toHaveBeenCalledWith({
      summary: '本卷简介', authors: [{ name: '译者', role: 'translator' }, { name: '作者', role: 'writer' }],
      links: [{ label: 'Bangumi', url: 'https://bgm.tv/subject/123' }],
    })
  })

  it('rejects stale previews, conflicting manual links, and upstream failures', async () => {
    const { run, state, adapterFetch, patchSeries } = fixture()
    const preview = await run('preview', seriesInput)
    state.title = '其他人修改的书名'
    await expect(run('apply', { previewId: preview.previewId })).rejects.toMatchObject({ code: 'METADATA_CHANGED' })
    state.links.push({ label: 'cbl', url: 'https://bgm.tv/subject/999' })
    await expect(run('preview', seriesInput)).rejects.toMatchObject({ code: 'BANGUMI_LINK_CONFLICT' })
    adapterFetch.mockRejectedValueOnce(new Error('connection failed'))
    await expect(run('search', { ...seriesInput, query: '测试' })).rejects.toMatchObject({ code: 'BANGUMIKOMGA_UNAVAILABLE' })
    expect(patchSeries).not.toHaveBeenCalled()
  })

  it('separates the metadata bearer from existing Studio access', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'studio-metadata-'))
    const tokenFile = path.join(dir, 'token')
    const token = 'studio_metadata_' + 'a'.repeat(43)
    await writeFile(tokenFile, token, { mode: 0o600 })
    try {
      const logger = { warn() {} }
      const api = createApi({}, {
        token: 'general-fixture-key', bangumiKomgaUrl: 'http://bangumikomga:8091', metadataTokenFile: tokenFile,
        integrations: { authorizeDsh: (req: { headers: { authorization: string } }) => req.headers.authorization === 'Bearer read-fixture' },
      }, logger)
      async function invoke(route: string, bearer: string, method = 'POST') {
        const request = {
          method, headers: { authorization: `Bearer ${bearer}` },
          async *[Symbol.asyncIterator]() { yield Buffer.from('{}') },
        }
        const response = {
          status: 0, body: '',
          writeHead(status: number) { this.status = status },
          end(body: string) { this.body = body },
        }
        await api(request, response, new URL(route, 'http://studio.local'))
        return { status: response.status, code: JSON.parse(response.body).error.code }
      }
      const preview = '/api/komga/metadata/preview'
      expect(await invoke(preview, 'read-fixture')).toEqual({ status: 403, code: 'METADATA_AUTH_REQUIRED' })
      expect(await invoke(preview, 'general-fixture-key')).toEqual({ status: 403, code: 'METADATA_AUTH_REQUIRED' })
      expect(await invoke(preview, token)).toEqual({ status: 400, code: 'INVALID_METADATA_TYPE' })
      expect(await invoke('/api/library', token, 'GET')).toEqual({ status: 401, code: 'UNAUTHORIZED' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

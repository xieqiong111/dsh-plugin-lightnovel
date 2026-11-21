import { describe, expect, it } from 'vitest'
import { createSuwayomiClient, SuwayomiError } from '../../server/suwayomi-client.mjs'
import { createSuwayomiMock } from '../support/suwayomi-mock.mjs'

const config = { url: 'http://suwayomi.test:4567', timeoutMs: 1000 }

describe('Suwayomi GraphQL client', () => {
  it('pins every request to /api/graphql, uses server-side Basic auth, and refuses redirects', async () => {
    const mock = createSuwayomiMock()
    const client = createSuwayomiClient({ ...config, username: 'reader', password: 'secret' }, { fetchImpl: mock.fetch })

    const result = await client.sources()

    expect(result.sources.map((source) => source.id)).toContain('0')
    expect(mock.calls.length).toBe(1)
    expect(mock.calls[0]!.url).toBe('http://suwayomi.test:4567/api/graphql')
    expect(mock.calls[0]!.init.redirect).toBe('error')
    expect((mock.calls[0]!.init.headers as Record<string, string>).authorization).toBe('Basic cmVhZGVyOnNlY3JldA==')
  })

  it('rejects base URLs with paths or credentials without making a request', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => { calls++; return new Response('{}') }
    for (const url of ['http://suwayomi.test/base', 'http://user:pass@suwayomi.test', 'http://suwayomi.test/?target=x']) {
      const client = createSuwayomiClient({ url }, { fetchImpl })
      expect(client.configured).toBe(false)
      await expect(client.sources()).rejects.toMatchObject({ code: 'INVALID_CONFIGURATION', status: 503 })
    }
    expect(calls).toBe(0)
  })

  it('reports a protected GraphQL health check and excludes the built-in local source from installed extensions', async () => {
    const mock = createSuwayomiMock({ chapters: [] })
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })

    await expect(client.health()).resolves.toMatchObject({
      reachable: true,
      authenticated: true,
      compatible: true,
      installedSources: 2,
      chapters: null,
      version: 'v2.4.2366',
    })
  })

  it('searches configured title aliases by source name and pages through merged overflow without dropping tails', async () => {
    const mock = createSuwayomiMock({
      mangas: [
        { ...createSuwayomiMock().mangas[0]!, id: '1', sourceId: '10' },
        { ...createSuwayomiMock().mangas[0]!, id: '2', title: '星港郵差', sourceId: '20' },
      ],
      search: (input, mangas) => input.source === '10' && input.query === '星际信使' ? [mangas[0]!] :
        input.source === '20' && input.query === '星港郵差' ? [mangas[1]!] : [],
    })
    const client = createSuwayomiClient(config, {
      fetchImpl: mock.fetch,
      env: { SUWAYOMI_TITLE_ALIASES: '[["星港邮差","星际信使"]]' },
    })

    const aliased = await client.searchManga({ query: '星港郵差', sourceId: '简体漫画', limit: 5 })
    expect(aliased.mangas.map((manga) => manga.id)).toContain('1')
    const searchCalls = mock.calls.filter(({ init }) => JSON.parse(String(init.body)).query.includes('fetchSourceManga'))
    expect(searchCalls.map(({ init }) => JSON.parse(String(init.body)).variables.input.query)).toContain('星际信使')

    const aggregate = await client.searchManga({ query: '星港郵差', limit: 1 })
    expect(aggregate.mangas).toHaveLength(1)
    expect(aggregate.truncated).toBe(false)
    expect(aggregate.nextOffset).toBe(1)
    expect(aggregate.hasNextPage).toBe(true)
    expect(aggregate.mangas[0]!.sourceId).toBe('10')
  })

  it('pages through installed sources even when the whole first SQL window is omitted as stale', async () => {
    const manySources = Array.from({ length: 205 }, (_, index) => ({
      id: String(index), name: `Source ${index}`, displayName: `Source ${index}`, lang: 'en',
    }))
    const mock = createSuwayomiMock({
      sources: manySources,
      nullSourceIds: [...manySources.slice(0, 100).map((source) => source.id), '102'],
      omitNullSources: true,
    })
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })

    const listed = await client.sources()

    expect(listed.totalCount).toBe(205)
    expect(listed.sources).toHaveLength(104)
    expect(listed.sources.map((source) => source.id)).toContain('204')
    const sourcePages = mock.calls.filter(({ init }) => JSON.parse(String(init.body)).query.includes('query MangaSources'))
    expect(sourcePages.map(({ init }) => JSON.parse(String(init.body)).variables.offset)).toEqual([0, 100, 200])
    expect(listed.hasNextPage).toBe(false)
  })

  it('returns each merged search chunk using nextOffset until that upstream page is exhausted', async () => {
    const base = createSuwayomiMock().mangas[0]!
    const rows = Array.from({ length: 150 }, (_, index) => ({
      ...base, id: String(index + 1), title: `query result ${index + 1}`, sourceId: '10',
    }))
    const mock = createSuwayomiMock({ mangas: rows, search: (input, mangas) => input.source === '10' ? mangas : [] })
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })

    const first = await client.searchManga({ query: 'query', sourceId: '10', limit: 100 })
    mock.mangas.reverse()
    const second = await client.searchManga({ query: 'query', sourceId: '10', limit: 100, offset: first.nextOffset!, resultId: first.resultId! })
    await expect(client.searchManga({ query: 'query', sourceId: '10', limit: 100, offset: first.nextOffset! }))
      .rejects.toMatchObject({ code: 'SEARCH_PAGE_EXPIRED' })
    expect(mock.calls.filter(({ init }) => String(init.body).includes('fetchSourceManga'))).toHaveLength(1)

    expect(first.mangas).toHaveLength(100)
    expect(first.nextOffset).toBe(100)
    expect(first.hasNextPage).toBe(true)
    expect(second.mangas).toHaveLength(50)
    expect(second.mangas[0]!.id).toBe('101')
    expect(second.nextOffset).toBeNull()
    expect(second.hasNextPage).toBe(false)
    expect(second.truncated).toBe(false)
  })

  it('single-flights the initial server chapter fetch when detail and chapters start together', async () => {
    const mock = createSuwayomiMock({ mangas: [{ ...createSuwayomiMock().mangas[0]!, initialized: false }] })
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })

    const [manga, chapterPage] = await Promise.all([client.getManga('1'), client.getChapters('1')])

    expect(manga.chapterCount).toBe(2)
    expect(chapterPage.chapters[0]!.id).toBe('102')
    expect(mock.refreshCount).toBe(1)
  })

  it('validates chapter ownership and skips chapters already queued or downloaded', async () => {
    const mock = createSuwayomiMock({
      chapters: [
        { id: '101', mangaId: '1', name: 'queued me', uploadDate: '1762909200000', pageCount: 8, isDownloaded: false },
        { id: '201', mangaId: '2', name: 'other manga', uploadDate: '1762909200000', pageCount: 8, isDownloaded: false },
        { id: '301', mangaId: '1', name: 'already downloaded', uploadDate: '1762909200000', pageCount: 8, isDownloaded: true },
      ],
      mangas: [
        { ...createSuwayomiMock().mangas[0]!, id: '1', sourceId: '10' },
        { ...createSuwayomiMock().mangas[0]!, id: '2', sourceId: '10' },
      ],
    })
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })

    const first = await client.download({ mangaId: '1', chapterIds: ['101'] })
    expect(first.queued).toEqual(['101'])
    expect(first.completed).toEqual([])
    expect(first.unconfirmed).toEqual([])
    const second = await client.download({ mangaId: '1', chapterIds: ['101', '301'] })
    expect(second.queued).toEqual([])
    expect(second.skipped.sort()).toEqual(['101', '301'])
    await expect(client.download({ mangaId: '1', chapterIds: ['201'] })).rejects.toMatchObject({ code: 'CHAPTER_MANGA_MISMATCH', status: 400 })
  })

  it('reports completed separately from IDs observed in the download queue', async () => {
    const mock = createSuwayomiMock({ hideEnqueuedEvidence: true, completeImmediately: true })
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })
    const result = await client.download({ mangaId: '1', chapterIds: ['101'] })
    expect(result.queued).toEqual([])
    expect(result.completed).toEqual(['101'])
    expect(result.unconfirmed).toEqual([])
    expect(mock.queue.size).toBe(0)
  })

  it('classifies a confirmed FINISHED queue item as completed', async () => {
    const mock = createSuwayomiMock({ enqueueFinished: true })
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })
    const result = await client.download({ mangaId: '1', chapterIds: ['101'] })
    expect(result).toMatchObject({ queued: [], completed: ['101'], unconfirmed: [] })
  })

  it('serializes same-process enqueue checks and reports the second request as already queued', async () => {
    const mock = createSuwayomiMock({ delay: 1 })
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })
    const [first, second] = await Promise.all([
      client.download({ mangaId: '1', chapterIds: ['101'] }),
      client.download({ mangaId: '1', chapterIds: ['101'] }),
    ])

    expect(mock.enqueueCount).toBe(1)
    expect(first.queued).toEqual(['101'])
    expect(second.queued).toEqual([])
    expect(second.skipped).toEqual(['101'])
  })

  it('keeps missing queue progress null instead of inventing zero', async () => {
    const mock = createSuwayomiMock({ missingQueueProgress: true })
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })
    await client.download({ mangaId: '1', chapterIds: ['101'] })

    const tasks = await client.tasks()
    expect(tasks.queue[0]!.percent).toBeNull()
  })

  it('does not report local-source chapters as downloadable', async () => {
    const mock = createSuwayomiMock({
      mangas: [{ ...createSuwayomiMock().mangas[0]!, sourceId: '0' }],
    })
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })
    await expect(client.download({ mangaId: '1', chapterIds: ['101'] })).rejects.toMatchObject({ code: 'LOCAL_SOURCE', status: 409 })
  })

  it('proxies only the server-provided same-origin thumbnail route and validates image type', async () => {
    const mock = createSuwayomiMock()
    const client = createSuwayomiClient(config, { fetchImpl: mock.fetch })
    const image = await client.cover('1')
    expect(image.contentType).toBe('image/png')
    expect(image.body.length).toBe(8)
    expect(mock.calls.at(-1)!.url).toBe('http://suwayomi.test:4567/api/v1/manga/1/thumbnail')
  })

  it('uses bounded timeouts and returns typed upstream errors', async () => {
    const slowFetch: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    })
    const client = createSuwayomiClient(config, { fetchImpl: slowFetch })
    await expect(client.sources()).rejects.toBeInstanceOf(SuwayomiError)
    await expect(client.sources()).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT', status: 504 })
  })
})

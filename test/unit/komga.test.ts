import { describe, expect, it, vi } from 'vitest'
import { createApi } from '../../server/api.mjs'
import { createKomgaClient } from '../../server/komga-client.mjs'
import { readSettings } from '../../server/runtime.mjs'

const libraryFixture = [{ id: 'library-1', name: 'Comics', root: '/library/comics' }]
const seriesFixture = {
  content: [{
    id: 'series-1',
    libraryId: 'library-1',
    name: 'Example Series',
    oneshot: false,
    booksCount: 4,
    booksReadCount: 1,
    booksUnreadCount: 2,
    booksInProgressCount: 1,
    metadata: {
      title: 'Example Series',
      titleSort: 'Example Series',
      summary: 'A short description',
      releaseDate: '2024-01-02',
      status: 'ONGOING',
    },
  }],
  number: 2,
  size: 24,
  totalElements: 49,
  totalPages: 3,
  first: false,
  last: false,
}

function request(method: string, pathname: string, options: { token?: string; ip?: string } = {}) {
  return {
    method,
    headers: options.token ? { 'x-ln-token': options.token } : {},
    socket: { remoteAddress: options.ip ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {},
    url: pathname,
  }
}

function responseSink() {
  return {
    status: 0,
    headers: {} as Record<string, string>,
    body: '' as string | Buffer,
    writeHead(status: number, headers: Record<string, string>) {
      this.status = status
      this.headers = headers
    },
    end(body: string | Buffer = '') {
      this.body = body
    },
    json() { return JSON.parse(String(this.body)) },
  }
}

function makeFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith('/api/v1/libraries')) {
      return new Response(JSON.stringify(libraryFixture), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v1/series/list?')) {
      return new Response(JSON.stringify(seriesFixture), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.endsWith('/api/v1/series/series-1/thumbnail')) {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    }
    return new Response('not found', { status: 404 })
  })
  return { calls, fetchImpl }
}

describe('Komga read-only adapter', () => {
  it('uses only the configured subpath, server-side API key, fixed GET endpoint, and no redirects', async () => {
    const { calls, fetchImpl } = makeFetch()
    const client = createKomgaClient({
      url: 'http://komga:25600/reader/',
      apiKey: 'server-secret',
      timeoutMs: 8000,
    }, { fetchImpl: fetchImpl as never })

    expect(await client.libraries()).toEqual({ libraries: [{ id: 'library-1', name: 'Comics' }] })
    expect(calls[0].url).toBe('http://komga:25600/reader/api/v1/libraries')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].init.redirect).toBe('error')
    expect((calls[0].init.headers as Record<string, string>)['X-API-Key']).toBe('server-secret')
    expect((calls[0].init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('posts bounded library-scoped series search and maps only catalog fields', async () => {
    const { calls, fetchImpl } = makeFetch()
    const client = createKomgaClient({ url: 'https://komga.example', username: 'reader', password: 'pass', timeoutMs: 8000 }, { fetchImpl: fetchImpl as never })

    const page = await client.series({ libraryId: 'library-1', query: 'dragon', page: 2, size: 24 })
    expect(calls[0].url).toBe('https://komga.example/api/v1/series/list?page=2&size=24&sort=metadata.titleSort%2Casc')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      condition: { libraryId: { operator: 'is', value: 'library-1' } },
      fullTextSearch: 'dragon',
    })
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('reader:pass').toString('base64')}`)
    expect(page).toEqual({
      content: [{
        id: 'series-1', libraryId: 'library-1', title: 'Example Series', titleSort: 'Example Series',
        summary: 'A short description', releaseDate: '2024-01-02', status: 'ONGOING', oneshot: false,
        booksCount: 4, booksReadCount: 1, booksUnreadCount: 2, booksInProgressCount: 1,
        thumbnailUrl: '/api/komga/series/series-1/thumbnail',
      }],
      page: { number: 2, size: 24, totalElements: 49, totalPages: 3, first: false, last: false },
    })
  })

  it('rejects URL traversal and oversized upstream payloads', async () => {
    const { fetchImpl } = makeFetch()
    const traversal = createKomgaClient({ url: 'http://komga/library/%2e%2e/admin', timeoutMs: 8000 }, { fetchImpl: fetchImpl as never })
    await expect(traversal.libraries()).rejects.toMatchObject({ code: 'INVALID_CONFIGURATION' })
    const backslashes = createKomgaClient({ url: 'https://nas.example\\komga\\..\\other' }, { fetchImpl: fetchImpl as never })
    await expect(backslashes.libraries()).rejects.toMatchObject({ code: 'INVALID_CONFIGURATION' })
    expect(fetchImpl).not.toHaveBeenCalled()

    for (const [status, code] of [[200, 'RESPONSE_TOO_LARGE'], [500, 'UPSTREAM_HTTP_ERROR']] as const) {
      const cancel = vi.fn()
      const client = createKomgaClient({ url: 'http://komga', timeoutMs: 8000 }, {
        fetchImpl: (async () => new Response(new ReadableStream({ cancel }), {
          status, headers: { 'content-length': String(8 * 1024 * 1024 + 1) },
        })) as never,
      })
      await expect(client.libraries()).rejects.toMatchObject({ code })
      expect(cancel).toHaveBeenCalledOnce()
    }
  })

  it('fails closed when required catalog or pagination fields are malformed', async () => {
    const malformed = {
      ...seriesFixture,
      content: [{ ...seriesFixture.content[0], booksCount: undefined }],
    }
    const client = createKomgaClient({ url: 'http://komga' }, {
      fetchImpl: (async () => new Response(JSON.stringify(malformed), { status: 200 })) as never,
    })
    await expect(client.series({ libraryId: 'library-1' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('shares the BFF token gate and keeps Komga authentication isolated from the browser', async () => {
    const { calls, fetchImpl } = makeFetch()
    const komga = createKomgaClient({ url: 'http://komga', apiKey: 'server-secret' }, { fetchImpl: fetchImpl as never })
    const manga = { sources: vi.fn(async () => ({ sources: [] })) }
    const logger = { warn: vi.fn(), error: vi.fn() }
    const settings = { token: 'studio-secret', corsOrigin: '', allowDelete: false, komgaCredentialsConfigured: true }
    const api = createApi({ suwayomi: manga, komga }, settings, logger as never, manga as never, komga as never)

    const unauthorized = responseSink()
    await api(request('GET', '/api/komga/libraries') as never, unauthorized as never, new URL('http://localhost/api/komga/libraries'))
    expect(unauthorized.status).toBe(401)
    expect(calls).toHaveLength(0)

    const authorized = responseSink()
    await api(request('GET', '/api/komga/libraries', { token: 'studio-secret' }) as never, authorized as never, new URL('http://localhost/api/komga/libraries'))
    expect(authorized.status).toBe(200)
    expect(authorized.json()).toEqual({ libraries: [{ id: 'library-1', name: 'Comics' }] })

    const missingBff = createApi(
      { suwayomi: manga, komga },
      { token: '', corsOrigin: '', allowDelete: false, komgaCredentialsConfigured: true },
      logger as never,
      manga as never,
      komga as never,
    )
    const blocked = responseSink()
    await missingBff(request('GET', '/api/komga/libraries') as never, blocked as never, new URL('http://localhost/api/komga/libraries'))
    expect(blocked.status).toBe(503)
    expect(blocked.json().error.code).toBe('BFF_AUTH_REQUIRED')
    expect(calls).toHaveLength(1)
  })

  it('serves Komga thumbnails and validates paging inputs through read-only routes', async () => {
    const { fetchImpl } = makeFetch()
    const komga = createKomgaClient({ url: 'http://komga' }, { fetchImpl: fetchImpl as never })
    const manga = { sources: vi.fn(async () => ({ sources: [] })) }
    const logger = { warn: vi.fn(), error: vi.fn() }
    const api = createApi({ suwayomi: manga, komga }, { token: '', corsOrigin: '', allowDelete: false }, logger as never, manga as never, komga as never)

    const invalid = responseSink()
    await api(request('GET', '/api/komga/series?libraryId=library-1&page=-1') as never, invalid as never, new URL('http://localhost/api/komga/series?libraryId=library-1&page=-1'))
    expect(invalid.status).toBe(400)

    const thumbnail = responseSink()
    await api(request('GET', '/api/komga/series/series-1/thumbnail') as never, thumbnail as never, new URL('http://localhost/api/komga/series/series-1/thumbnail'))
    expect(thumbnail.status).toBe(200)
    expect(thumbnail.headers['content-type']).toBe('image/jpeg')
    expect(thumbnail.headers['x-content-type-options']).toBe('nosniff')
    expect(Buffer.isBuffer(thumbnail.body)).toBe(true)
  })

  it('requires Studio authentication for configured credentials but leaves Komga opt-in', () => {
    expect(readSettings({ LN_KOMGA_URL: '', LN_KOMGA_API_KEY: '', LN_KOMGA_USERNAME: '', LN_KOMGA_PASSWORD: '' }).komgaCredentialsConfigured).toBe(false)
    expect(readSettings({ LN_KOMGA_API_KEY: 'server-secret' }).komgaCredentialsConfigured).toBe(true)
    expect(readSettings({ LN_KOMGA_USERNAME: 'reader', LN_KOMGA_PASSWORD: 'pass' }).komgaCredentialsConfigured).toBe(true)
  })
})

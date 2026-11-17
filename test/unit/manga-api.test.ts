import { describe, expect, it, vi } from 'vitest'
import { createApi } from '../../server/api.mjs'

function request(method: string, pathname: string, options: { token?: string; contentType?: string; body?: object; ip?: string } = {}) {
  return {
    method,
    headers: {
      ...(options.token ? { 'x-ln-token': options.token } : {}),
      ...(options.contentType ? { 'content-type': options.contentType } : {}),
    },
    socket: { remoteAddress: options.ip ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (options.body !== undefined) yield Buffer.from(JSON.stringify(options.body))
    },
    url: pathname,
  }
}

function responseSink() {
  return {
    status: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(status: number, headers: Record<string, string>) {
      this.status = status
      this.headers = headers
    },
    end(body = '') {
      this.body = String(body)
    },
    json() { return JSON.parse(this.body) },
  }
}

describe('Suwayomi BFF routes', () => {
  const logger = { warn: vi.fn(), error: vi.fn() }

  it('shares the BFF token gate and serves manga routes only under the exact prefix', async () => {
    const client = { sources: vi.fn(async () => ({ sources: [{ id: '0', name: 'Local', lang: 'localsourcelang' }] })) }
    const api = createApi({ suwayomi: client }, { token: 'test-secret', corsOrigin: '', allowDelete: false }, logger as never, client as never)
    const unauthorized = responseSink()
    await api(request('GET', '/api/manga/sources') as never, unauthorized as never, new URL('http://localhost/api/manga/sources'))
    expect(unauthorized.status).toBe(401)
    expect(client.sources).not.toHaveBeenCalled()

    const authorized = responseSink()
    await api(request('GET', '/api/manga/sources', { token: 'test-secret' }) as never, authorized as never, new URL('http://localhost/api/manga/sources'))
    expect(authorized.status).toBe(200)
    expect(authorized.json().sources[0].id).toBe('0')

    const prefixAlias = responseSink()
    await api(request('GET', '/api/mangasearch', { token: 'test-secret' }) as never, prefixAlias as never, new URL('http://localhost/api/mangasearch'))
    expect(prefixAlias.status).toBe(404)

    const malformed = responseSink()
    await api(request('GET', '/api/manga/%ZZ', { token: 'test-secret' }) as never, malformed as never, new URL('http://localhost/api/manga/%ZZ'))
    expect(malformed.status).toBe(400)
    expect(malformed.json().error.code).toBe('INVALID_PATH')
  })

  it('requires Studio authentication before proxying saved Suwayomi credentials', async () => {
    const client = { sources: vi.fn(async () => ({ sources: [] })) }
    const settings = { token: '', corsOrigin: '', allowDelete: false, mangaCredentialsConfigured: true }
    const api = createApi({ suwayomi: client, dartAvailable: true }, settings, logger as never, client as never)
    const blocked = responseSink()
    await api(request('GET', '/api/manga/sources') as never, blocked as never, new URL('http://localhost/api/manga/sources'))
    expect(blocked.status).toBe(503)
    expect(blocked.json().error.code).toBe('BFF_AUTH_REQUIRED')
    expect(client.sources).not.toHaveBeenCalled()

    const novel = responseSink()
    await api(request('GET', '/api/health') as never, novel as never, new URL('http://localhost/api/health'))
    expect(novel.status).toBe(200)
    expect(novel.json().dart).toBe(true)
  })

  it('keeps queue reads available while a full book shelf loads covers', async () => {
    const client = {
      cover: vi.fn(async () => ({ contentType: 'image/png', body: Buffer.alloc(8) })),
      tasks: vi.fn(async () => ({ queue: [] })),
    }
    const api = createApi({ suwayomi: client }, { token: '', corsOrigin: '', allowDelete: false, mangaCredentialsConfigured: false }, logger as never, client as never)
    for (let index = 1; index <= 120; index++) {
      const pathname = `/api/manga/${index}/cover`
      const cover = responseSink()
      await api(request('GET', pathname) as never, cover as never, new URL(pathname, 'http://localhost'))
      expect(cover.status).toBe(200)
    }
    const queue = responseSink()
    await api(request('GET', '/api/manga/downloads') as never, queue as never, new URL('http://localhost/api/manga/downloads'))
    expect(queue.status).toBe(200)
    expect(client.tasks).toHaveBeenCalledOnce()
  })

  it('requires JSON mutation bodies and confirms the requested library state', async () => {
    const client = {
      setLibrary: vi.fn(async ({ inLibrary }: { inLibrary: boolean }) => ({ id: '1', inLibrary, subscribed: inLibrary })),
    }
    const api = createApi({ suwayomi: client }, { token: '', corsOrigin: '', allowDelete: false }, logger as never, client as never)
    const unsupported = responseSink()
    await api(
      request('POST', '/api/manga/1/subscribe', { contentType: 'text/plain', body: { subscribed: false } }) as never,
      unsupported as never,
      new URL('http://localhost/api/manga/1/subscribe'),
    )
    expect(unsupported.status).toBe(415)
    expect(client.setLibrary).not.toHaveBeenCalled()

    const removed = responseSink()
    await api(
      request('POST', '/api/manga/1/subscribe', { contentType: 'application/json', body: { subscribed: false } }) as never,
      removed as never,
      new URL('http://localhost/api/manga/1/subscribe'),
    )
    expect(removed.status).toBe(200)
    expect(removed.json()).toMatchObject({ inLibrary: false, subscribed: false })
  })

  it('rate-limits searches per client IP and returns Retry-After', async () => {
    const client = { searchManga: vi.fn(async () => ({ mangas: [], hasNextPage: false, errors: [] })) }
    const api = createApi({ suwayomi: client }, { token: '', corsOrigin: '', allowDelete: false }, logger as never, client as never)

    for (let index = 0; index < 10; index++) {
      const res = responseSink()
      await api(request('GET', '/api/manga/search?query=test', { ip: '192.0.2.8' }) as never, res as never, new URL('http://localhost/api/manga/search?query=test'))
      expect(res.status).toBe(200)
    }
    const limited = responseSink()
    await api(request('GET', '/api/manga/search?query=test', { ip: '192.0.2.8' }) as never, limited as never, new URL('http://localhost/api/manga/search?query=test'))
    expect(limited.status).toBe(429)
    expect(limited.headers['retry-after']).toBe('60')
    expect(client.searchManga).toHaveBeenCalledTimes(10)
  })
})

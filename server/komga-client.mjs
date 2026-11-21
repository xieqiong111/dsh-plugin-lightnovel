/**
 * Server-side adapter for Komga's REST API.
 *
 * The configured base URL may include a reverse-proxy context path. Credentials
 * are attached only to these fixed API endpoints; redirects are rejected.
 */

const MAX_JSON_BYTES = 8 * 1024 * 1024
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 8000
const MAX_TIMEOUT_MS = 30000

export class KomgaError extends Error {
  constructor(code, message, status = 502) {
    super(message)
    this.name = 'KomgaError'
    this.code = code
    this.status = status
  }
}

function safeTimeout(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS
  return Math.max(1000, Math.min(MAX_TIMEOUT_MS, Math.trunc(parsed)))
}

export function normalizeKomgaUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  if (!/^https?:\/\//i.test(raw) || /[\\\x00-\x20\x7f]/.test(raw)) {
    throw new KomgaError('INVALID_CONFIGURATION', 'LN_KOMGA_URL must be a valid HTTP(S) URL without spaces or backslashes', 503)
  }
  let base
  try {
    base = new URL(raw)
  } catch {
    throw new KomgaError('INVALID_CONFIGURATION', 'LN_KOMGA_URL must be a valid HTTP(S) URL', 503)
  }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new KomgaError('INVALID_CONFIGURATION', 'LN_KOMGA_URL must be an HTTP(S) URL without credentials, query, or fragment', 503)
  }
  // URL normalizes dot segments. Check the supplied path too so traversal never
  // gets silently rewritten when an admin configures a reverse-proxy prefix.
  const rawAuthorityEnd = raw.indexOf('://') + 3
  const pathStart = raw.indexOf('/', rawAuthorityEnd)
  const rawPath = pathStart < 0 ? '' : raw.slice(pathStart).split(/[?#]/, 1)[0]
  let decodedPath
  try { decodedPath = decodeURIComponent(rawPath) } catch {
    throw new KomgaError('INVALID_CONFIGURATION', 'LN_KOMGA_URL contains an invalid path encoding', 503)
  }
  const pathParts = decodedPath.split('/').filter(Boolean)
  if (decodedPath.includes('\\') || decodedPath.includes('\0') || pathParts.some((part) =>
    part === '.' || part === '..' || !/^[A-Za-z0-9._~-]+$/.test(part))) {
    throw new KomgaError('INVALID_CONFIGURATION', 'LN_KOMGA_URL must not contain dot segments or backslashes', 503)
  }
  const basePath = base.pathname.replace(/\/+$/, '')
  return `${base.origin}${basePath}`
}

export function readKomgaConfig(env = process.env) {
  return {
    url: env.LN_KOMGA_URL || '',
    apiKey: env.LN_KOMGA_API_KEY || '',
    username: env.LN_KOMGA_USERNAME || '',
    password: env.LN_KOMGA_PASSWORD || '',
    timeoutMs: safeTimeout(env.LN_KOMGA_TIMEOUT_MS),
  }
}

function responseHeader(response, name) {
  return response.headers?.get?.(name) ?? ''
}

async function readLimitedBody(response, maxBytes) {
  const declared = Number(responseHeader(response, 'content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new KomgaError('RESPONSE_TOO_LARGE', 'Komga response exceeded the size limit', 502)
  }
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > maxBytes) throw new KomgaError('RESPONSE_TOO_LARGE', 'Komga response exceeded the size limit', 502)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new KomgaError('RESPONSE_TOO_LARGE', 'Komga response exceeded the size limit', 502)
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock?.()
  }
  return Buffer.concat(chunks, length)
}

function responseError(response) {
  if (response.status === 401 || response.status === 403) {
    return new KomgaError('AUTHENTICATION_FAILED', 'Komga rejected the configured credentials', 502)
  }
  return new KomgaError('UPSTREAM_HTTP_ERROR', `Komga returned HTTP ${response.status}`, 502)
}

function safeId(value, label = 'id') {
  const id = String(value ?? '')
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) {
    throw new KomgaError('INVALID_ID', `${label} is invalid`, 400)
  }
  return id
}

function requiredCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new KomgaError('INVALID_RESPONSE', `Komga returned an invalid ${label}`, 502)
  }
  return value
}

function requiredBoolean(value, label) {
  if (typeof value !== 'boolean') throw new KomgaError('INVALID_RESPONSE', `Komga returned an invalid ${label}`, 502)
  return value
}

function requiredText(value, label) {
  if (typeof value !== 'string') throw new KomgaError('INVALID_RESPONSE', `Komga returned an invalid ${label}`, 502)
  return value
}

function requiredResponseId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
    throw new KomgaError('INVALID_RESPONSE', `Komga returned an invalid ${label}`, 502)
  }
  return value
}

function optionalText(value, label) {
  if (value === null || value === undefined) return null
  return requiredText(value, label)
}

function seriesDto(item) {
  if (!item || typeof item !== 'object' || !item.metadata || typeof item.metadata !== 'object') {
    throw new KomgaError('INVALID_RESPONSE', 'Komga returned incomplete series data', 502)
  }
  const metadata = item.metadata
  if (typeof item.oneshot !== 'boolean') throw new KomgaError('INVALID_RESPONSE', 'Komga returned invalid series state', 502)
  const id = requiredResponseId(item.id, 'series ID')
  return {
    id,
    libraryId: requiredResponseId(item.libraryId, 'series library ID'),
    title: requiredText(metadata.title, 'series title'),
    titleSort: requiredText(metadata.titleSort, 'series sort title'),
    summary: requiredText(metadata.summary, 'series summary'),
    releaseDate: optionalText(metadata.releaseDate, 'series release date'),
    status: requiredText(metadata.status, 'series status'),
    oneshot: item.oneshot,
    booksCount: requiredCount(item.booksCount, 'series book count'),
    booksReadCount: requiredCount(item.booksReadCount, 'series read book count'),
    booksUnreadCount: requiredCount(item.booksUnreadCount, 'series unread book count'),
    booksInProgressCount: requiredCount(item.booksInProgressCount, 'series in-progress book count'),
    thumbnailUrl: `/api/komga/series/${encodeURIComponent(id)}/thumbnail`,
  }
}

export function createKomgaClient(config = readKomgaConfig(), options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = safeTimeout(config.timeoutMs)
  const apiKey = String(config.apiKey ?? '')
  const username = String(config.username ?? '')
  const password = String(config.password ?? '')
  let baseUrl = null
  let configError = null
  try {
    if ((username && !password) || (!username && password) || /[\u0000-\u001f\u007f]/.test(apiKey) ||
      /[\u0000-\u001f\u007f:]/.test(username) || /[\u0000-\u001f\u007f]/.test(password)) {
      throw new KomgaError('INVALID_CONFIGURATION', 'Komga credentials must be an API key or a complete username/password pair', 503)
    }
    if (apiKey && (username || password)) {
      throw new KomgaError('INVALID_CONFIGURATION', 'Configure either LN_KOMGA_API_KEY or the Komga username/password pair', 503)
    }
    baseUrl = normalizeKomgaUrl(config.url)
  } catch (error) {
    configError = error instanceof KomgaError ? error : new KomgaError('INVALID_CONFIGURATION', 'Komga configuration is invalid', 503)
  }

  const authHeaders = apiKey
    ? { 'X-API-Key': apiKey }
    : username && password
      ? { authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }
      : {}
  const configured = Boolean(baseUrl && !configError)

  function requireConfigured() {
    if (configError) throw configError
    if (!configured) throw new KomgaError('NOT_CONFIGURED', 'Komga is not configured', 503)
  }

  async function request(pathname, { method = 'GET', body, maxBytes = MAX_JSON_BYTES } = {}) {
    requireConfigured()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref?.()
    try {
      const response = await fetchImpl(`${baseUrl}${pathname}`, {
        method,
        headers: {
          accept: maxBytes === MAX_THUMBNAIL_BYTES ? 'image/*' : 'application/json',
          ...authHeaders,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
        redirect: 'error',
        cache: 'no-store',
      })
      try {
        if (!response.ok) throw responseError(response)
        const bytes = await readLimitedBody(response, maxBytes)
        return { response, bytes }
      } catch (error) {
        void response.body?.cancel().catch(() => {})
        throw error
      }
    } catch (error) {
      if (error instanceof KomgaError) throw error
      if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new KomgaError('UPSTREAM_TIMEOUT', `Komga did not respond within ${timeoutMs} ms`, 504)
      }
      throw new KomgaError('UPSTREAM_UNAVAILABLE', 'Komga could not be reached', 502)
    } finally {
      clearTimeout(timer)
    }
  }

  async function requestJson(pathname, init) {
    const { bytes } = await request(pathname, init)
    try {
      return JSON.parse(bytes.toString('utf8'))
    } catch {
      throw new KomgaError('INVALID_RESPONSE', 'Komga returned invalid JSON', 502)
    }
  }

  async function libraries({ includePaths = false } = {}) {
    const payload = await requestJson('/api/v1/libraries')
    if (!Array.isArray(payload)) throw new KomgaError('INVALID_RESPONSE', 'Komga returned an invalid library list', 502)
    return {
      libraries: payload.map((item) => {
        if (!item || typeof item.name !== 'string') {
          throw new KomgaError('INVALID_RESPONSE', 'Komga returned incomplete library data', 502)
        }
        return {
          id: requiredResponseId(item.id, 'library ID'),
          name: item.name,
          ...(includePaths ? { root: typeof item.root === 'string' ? item.root : null } : {}),
        }
      }),
    }
  }

  async function series({ libraryId, query = '', page = 0, size = 24 }) {
    const id = safeId(libraryId, 'libraryId')
    const body = {
      condition: { libraryId: { operator: 'is', value: id } },
      ...(query ? { fullTextSearch: query } : {}),
    }
    const params = new URLSearchParams({ page: String(page), size: String(size), sort: 'metadata.titleSort,asc' })
    const payload = await requestJson(`/api/v1/series/list?${params}`, { method: 'POST', body })
    if (!payload || !Array.isArray(payload.content)) throw new KomgaError('INVALID_RESPONSE', 'Komga returned an invalid series page', 502)
    return {
      content: payload.content.map(seriesDto),
      page: {
        number: requiredCount(payload.number, 'page number'),
        size: requiredCount(payload.size, 'page size'),
        totalElements: requiredCount(payload.totalElements, 'total series count'),
        totalPages: requiredCount(payload.totalPages, 'total page count'),
        first: requiredBoolean(payload.first, 'page first flag'),
        last: requiredBoolean(payload.last, 'page last flag'),
      },
    }
  }

  async function thumbnail(seriesId) {
    const id = safeId(seriesId, 'seriesId')
    const { response, bytes } = await request(`/api/v1/series/${encodeURIComponent(id)}/thumbnail`, {
      maxBytes: MAX_THUMBNAIL_BYTES,
    })
    const contentType = responseHeader(response, 'content-type').split(';', 1)[0].trim().toLowerCase()
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) {
      throw new KomgaError('INVALID_RESPONSE', 'Komga returned an unsupported thumbnail type', 502)
    }
    return { contentType, body: bytes }
  }

  async function scanLibrary(libraryId) {
    const id = safeId(libraryId, 'libraryId')
    const { response } = await request(`/api/v1/libraries/${encodeURIComponent(id)}/scan`, {
      method: 'POST',
      maxBytes: 16 * 1024,
    })
    if (response.status !== 202) throw new KomgaError('INVALID_RESPONSE', 'Komga did not accept the library scan', 502)
  }

  function metadataPath(scope, id) {
    const collection = scope === 'series' ? 'series' : 'books'
    return `/api/v1/${collection}/${safeId(id, 'Komga ID')}`
  }

  async function metadataBooks(seriesId, page) {
    const params = new URLSearchParams({ page: String(page), size: '30', sort: 'metadata.numberSort,asc' })
    const payload = await requestJson(`/api/v1/books/list?${params}`, {
      method: 'POST', body: { condition: { allOf: [
        { seriesId: { operator: 'is', value: safeId(seriesId, 'seriesId') } },
        { deleted: { operator: 'isFalse' } },
      ] } },
    })
    if (!payload || !Array.isArray(payload.content) || payload.content.length > 30) {
      throw new KomgaError('INVALID_RESPONSE', 'Komga returned an invalid book page', 502)
    }
    return {
      books: payload.content.map((item) => {
        if (item?.seriesId !== seriesId) throw new KomgaError('INVALID_RESPONSE', 'Komga returned a book from another series', 502)
        return {
          id: requiredResponseId(item.id, 'book ID'),
          name: requiredText(item.name, 'book name'),
          title: requiredText(item.metadata?.title, 'book title'),
          number: optionalText(item.metadata?.number, 'book number'),
        }
      }),
      page: requiredCount(payload.number, 'page number'),
      last: requiredBoolean(payload.last, 'page last flag'),
    }
  }

  async function metadataTarget(scope, id) {
    const item = await requestJson(metadataPath(scope, id))
    if (!item || item.id !== id || !item.metadata || typeof item.metadata !== 'object' ||
        typeof item.name !== 'string' || item.deleted === true) {
      throw new KomgaError('INVALID_RESPONSE', 'Komga did not return the requested active item', 502)
    }
    return {
      id: item.id,
      name: item.name,
      libraryId: requiredResponseId(item.libraryId, 'library ID'),
      seriesId: scope === 'series' ? id : requiredResponseId(item.seriesId, 'series ID'),
      metadata: item.metadata,
    }
  }

  async function patchMetadata(scope, id, body) {
    const { response } = await request(`${metadataPath(scope, id)}/metadata`, {
      method: 'PATCH', body, maxBytes: 16 * 1024,
    })
    if (response.status !== 204) throw new KomgaError('INVALID_RESPONSE', 'Komga did not confirm the metadata update', 502)
  }

  async function status() {
    if (configError) throw configError
    if (!baseUrl) return { configured: false, connected: false }
    const result = await libraries()
    return { configured: true, connected: true, libraryCount: result.libraries.length }
  }

  return { configured, libraries, series, thumbnail, status, scanLibrary, metadataBooks, metadataTarget, patchMetadata }
}

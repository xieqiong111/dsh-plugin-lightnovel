import { SuwayomiError } from './suwayomi-client.mjs'
import { createMangaKomga } from './manga-komga.mjs'

const MAX_BODY = 16 * 1024

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(body)
}

function sendError(res, status, code, message, headers = {}) {
  sendJson(res, status, { error: { code, message } }, headers)
}

class MangaApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function pathSegments(pathname) {
  return pathname.slice('/api/manga'.length).split('/').filter(Boolean).map((segment) => {
    let decoded
    try { decoded = decodeURIComponent(segment) } catch {
      throw new MangaApiError(400, 'INVALID_PATH', 'Malformed percent-encoding')
    }
    if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) {
      throw new MangaApiError(400, 'INVALID_PATH', 'Invalid path segment')
    }
    return decoded
  })
}

function queryParam(params, name, { fallback = '', maxLength = 200 } = {}) {
  const values = params.getAll(name)
  if (values.length > 1) throw new MangaApiError(400, 'INVALID_QUERY', `Only one ${name} parameter is allowed`)
  const value = values[0] ?? fallback
  if (value.length > maxLength) throw new MangaApiError(400, 'INVALID_QUERY', `${name} is too long`)
  return value
}

function intParam(params, name, fallback, min, max) {
  const raw = queryParam(params, name, { fallback: String(fallback), maxLength: 12 })
  if (!/^(0|[1-9]\d*)$/.test(raw)) throw new MangaApiError(400, 'INVALID_QUERY', `${name} must be a non-negative integer`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new MangaApiError(400, 'INVALID_QUERY', `${name} must be from ${min} to ${max}`)
  }
  return value
}

async function readJson(req) {
  const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new MangaApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json')
  }
  const declared = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    throw new MangaApiError(413, 'BODY_TOO_LARGE', 'Request body exceeds 16 KB')
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new MangaApiError(413, 'BODY_TOO_LARGE', 'Request body exceeds 16 KB')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('expected object')
    return body
  } catch {
    throw new MangaApiError(400, 'INVALID_JSON', 'Expected a JSON object')
  }
}

function requiredId(value, field) {
  const id = String(value ?? '')
  if (!/^(0|[1-9]\d*)$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw new MangaApiError(400, 'INVALID_ID', `${field} must be a numeric Suwayomi ID`)
  }
  return id
}

/**
 * Handles the browser-facing `/api/manga/*` routes. The parent router applies
 * the shared LN_BFF_TOKEN check before dispatching to this handler.
 */
export function createMangaApi(client, logger = { warn() {} }, { missingBffAuth = false, getVolumes } = {}) {
  const komga = createMangaKomga(client, getVolumes)
  const requestBuckets = new Map()
  function limitRequest(req, bucketName, maxRequests) {
    const now = Date.now()
    const ip = req.socket?.remoteAddress ?? 'unknown'
    const key = `${ip}:${bucketName}`
    let bucket = requestBuckets.get(key)
    if (!bucket || now - bucket.start >= 60_000) {
      bucket = { start: now, count: 0 }
      requestBuckets.set(key, bucket)
    }
    bucket.count++
    if (bucket.count > maxRequests) throw new MangaApiError(429, 'RATE_LIMITED', 'Too many manga API requests; retry in one minute')
    if (requestBuckets.size > 2048) {
      for (const [entryKey, entry] of requestBuckets) if (now - entry.start >= 60_000) requestBuckets.delete(entryKey)
    }
  }

  return async function handleMangaApi(req, res, url) {
    if (url.pathname !== '/api/manga' && !url.pathname.startsWith('/api/manga/')) return false
    try {
      if (missingBffAuth) {
        throw new MangaApiError(503, 'BFF_AUTH_REQUIRED', 'Set LN_BFF_TOKEN before connecting Studio to a credential-protected Suwayomi server')
      }
      if (!['GET', 'POST'].includes(req.method ?? 'GET')) {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
        return true
      }
      const segments = pathSegments(url.pathname)
      const method = req.method ?? 'GET'
      const params = url.searchParams
      if (method === 'POST') limitRequest(req, 'mutation', 12)
      else if (segments[0] === 'search') limitRequest(req, 'search', 10)
      else if (segments.length === 2 && segments[1] === 'cover') limitRequest(req, 'cover', 200)
      else limitRequest(req, 'read', 120)

      if (method === 'GET' && segments.length === 1 && segments[0] === 'health') {
        sendJson(res, 200, await client.health())
        return true
      }
      if (method === 'GET' && segments.length === 1 && segments[0] === 'sources') {
        sendJson(res, 200, await client.sources())
        return true
      }
      if (method === 'GET' && segments.length === 1 && segments[0] === 'search') {
        const query = queryParam(params, 'query')
        const sourceId = queryParam(params, 'sourceId', { maxLength: 160 })
        const type = queryParam(params, 'type', { fallback: 'SEARCH', maxLength: 16 }).toUpperCase()
        if (!['SEARCH', 'POPULAR', 'LATEST'].includes(type)) {
          throw new MangaApiError(400, 'INVALID_QUERY', 'type must be SEARCH, POPULAR, or LATEST')
        }
        sendJson(res, 200, await client.searchManga({
          query,
          sourceId,
          type,
          page: intParam(params, 'page', 1, 1, 10000),
          offset: intParam(params, 'offset', 0, 0, 1000),
          resultId: queryParam(params, 'resultId', { maxLength: 40 }),
          limit: intParam(params, 'limit', 20, 1, 50),
        }))
        return true
      }
      if (method === 'GET' && segments.length === 1 && segments[0] === 'library') {
        sendJson(res, 200, await client.library({
          limit: intParam(params, 'limit', 50, 1, 100),
          offset: intParam(params, 'offset', 0, 0, 1000000),
        }))
        return true
      }
      if (method === 'POST' && segments.length === 2 && segments[0] === 'library' && segments[1] === 'refresh') {
        const body = await readJson(req)
        sendJson(res, 202, await client.refreshLibrary({ categoryIds: body.categoryIds }))
        return true
      }
      if (method === 'GET' && segments.length === 1 && segments[0] === 'downloads') {
        const result = await client.tasks({ action: 'list' })
        sendJson(res, 200, result)
        return true
      }
      if (method === 'POST' && segments.length === 1 && segments[0] === 'downloads') {
        const body = await readJson(req)
        const mangaId = requiredId(body.mangaId, 'mangaId')
        if (!Array.isArray(body.chapterIds) || body.chapterIds.length === 0 || body.chapterIds.length > 50) {
          throw new MangaApiError(400, 'INVALID_CHAPTERS', 'chapterIds must contain 1 to 50 IDs')
        }
        const chapterIds = body.chapterIds.map((id) => requiredId(id, 'chapterId'))
        sendJson(res, 200, await client.download({ mangaId, chapterIds }))
        return true
      }
      if (method === 'POST' && segments.length === 2 && segments[0] === 'downloads' && segments[1] === 'cancel') {
        const body = await readJson(req)
        if (!Array.isArray(body.chapterIds) || body.chapterIds.length === 0 || body.chapterIds.length > 100) {
          throw new MangaApiError(400, 'INVALID_CHAPTERS', 'chapterIds must contain 1 to 100 IDs')
        }
        const chapterIds = body.chapterIds.map((id) => requiredId(id, 'chapterId'))
        sendJson(res, 200, await client.tasks({ action: 'cancel', chapterIds }))
        return true
      }
      if (segments.length >= 1 && segments.length <= 3) {
        const mangaId = requiredId(segments[0], 'mangaId')
        if (method === 'GET' && segments.length === 1) {
          sendJson(res, 200, await client.getManga(mangaId))
          return true
        }
        if (segments.length === 2 && segments[1] === 'komga') {
          if (method === 'GET') {
            const volume = params.has('volume') ? intParam(params, 'volume', 1, 1, 9999) : undefined
            sendJson(res, 200, await komga.status(mangaId, volume))
          } else {
            const { volume } = await readJson(req)
            if (volume === undefined) throw new MangaApiError(400, 'INVALID_VOLUME', '请选择有效卷号。')
            sendJson(res, 200, await komga.download(mangaId, volume))
          }
          return true
        }
        if (method === 'GET' && segments.length === 2 && segments[1] === 'chapters') {
          const result = await client.getChapters(mangaId, {
            limit: intParam(params, 'limit', 50, 1, 100),
            offset: intParam(params, 'offset', 0, 0, 1000000),
          })
          sendJson(res, 200, result)
          return true
        }
        if (method === 'POST' && segments.length === 3 && segments[1] === 'chapters' && segments[2] === 'refresh') {
          await readJson(req)
          sendJson(res, 200, await client.refreshChapters(mangaId))
          return true
        }
        if (method === 'GET' && segments.length === 2 && segments[1] === 'cover') {
          const { contentType, body } = await client.cover(mangaId)
          res.writeHead(200, {
            'content-type': contentType,
            'content-length': body.length,
            'cache-control': 'private, no-store',
            'x-content-type-options': 'nosniff',
            'content-security-policy': "default-src 'none'; sandbox",
          })
          res.end(body)
          return true
        }
        if (method === 'POST' && segments.length === 2 && ['library', 'subscribe'].includes(segments[1])) {
          const body = await readJson(req)
          if (segments[1] === 'library') {
            if (typeof body.inLibrary !== 'boolean') throw new MangaApiError(400, 'INVALID_ARGUMENT', 'inLibrary must be a boolean')
            sendJson(res, 200, await client.setLibrary({ mangaId, inLibrary: body.inLibrary }))
          } else {
            if (typeof body.subscribed !== 'boolean') throw new MangaApiError(400, 'INVALID_ARGUMENT', 'subscribed must be a boolean')
            sendJson(res, 200, await client.setLibrary({ mangaId, inLibrary: body.subscribed }))
          }
          return true
        }
      }

      sendError(res, 404, 'NOT_FOUND', `No endpoint for ${method} ${url.pathname}`)
      return true
    } catch (error) {
      if (error instanceof MangaApiError || error instanceof SuwayomiError) {
        sendError(res, error.status, error.code, error.message, error.status === 429 ? { 'retry-after': '60' } : {})
        return true
      }
      logger.warn('manga-api', 'request_failed', { method: req.method, path: url.pathname })
      sendError(res, 500, 'INTERNAL_ERROR', 'Manga API request failed')
      return true
    }
  }
}

import { KomgaError } from './komga-client.mjs'

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

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } }, status === 429 ? { 'retry-after': '60' } : {})
}

class KomgaApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function queryParam(params, name, { fallback = '', maxLength = 200 } = {}) {
  const values = params.getAll(name)
  if (values.length > 1) throw new KomgaApiError(400, 'INVALID_QUERY', `Only one ${name} parameter is allowed`)
  const value = values[0] ?? fallback
  if (value.length > maxLength) throw new KomgaApiError(400, 'INVALID_QUERY', `${name} is too long`)
  return value
}

function intParam(params, name, fallback, min, max) {
  const raw = queryParam(params, name, { fallback: String(fallback), maxLength: 12 })
  if (!/^(0|[1-9]\d*)$/.test(raw)) throw new KomgaApiError(400, 'INVALID_QUERY', `${name} must be a non-negative integer`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new KomgaApiError(400, 'INVALID_QUERY', `${name} must be from ${min} to ${max}`)
  }
  return value
}

function decodeSegment(value) {
  try {
    const decoded = decodeURIComponent(value)
    if (!decoded || decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) {
      throw new Error('invalid segment')
    }
    return decoded
  } catch {
    throw new KomgaApiError(400, 'INVALID_PATH', 'Invalid path segment')
  }
}

/** Handles only read-only routes; createApi applies the shared BFF token gate first. */
export function createKomgaApi(client, logger = { warn() {} }, { missingBffAuth = false } = {}) {
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
    if (bucket.count > maxRequests) throw new KomgaApiError(429, 'RATE_LIMITED', 'Too many Komga API requests; retry in one minute')
    if (requestBuckets.size > 2048) {
      for (const [entryKey, entry] of requestBuckets) if (now - entry.start >= 60_000) requestBuckets.delete(entryKey)
    }
  }

  return async function handleKomgaApi(req, res, url) {
    if (url.pathname !== '/api/komga' && !url.pathname.startsWith('/api/komga/')) return false
    try {
      if (missingBffAuth) {
        throw new KomgaApiError(503, 'BFF_AUTH_REQUIRED', 'Set LN_BFF_TOKEN before connecting Studio to a credential-protected Komga server')
      }
      if (req.method !== 'GET') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
        return true
      }
      const rawSegments = url.pathname.slice('/api/komga'.length).split('/').filter(Boolean)
      const segments = rawSegments.map(decodeSegment)
      if (segments.length === 2 && segments[0] === 'series' && segments[1] === 'thumbnail') {
        throw new KomgaApiError(400, 'INVALID_PATH', 'A series ID is required')
      }
      if (segments[0] === 'series' && segments.length === 3 && segments[2] === 'thumbnail') {
        limitRequest(req, 'thumbnail', 360)
      } else {
        limitRequest(req, 'read', 90)
      }

      if (segments.length === 1 && segments[0] === 'status') {
        sendJson(res, 200, await client.status())
        return true
      }
      if (segments.length === 1 && segments[0] === 'libraries') {
        sendJson(res, 200, await client.libraries())
        return true
      }
      if (segments.length === 1 && segments[0] === 'series') {
        const libraryId = queryParam(url.searchParams, 'libraryId', { maxLength: 200 })
        if (!libraryId) throw new KomgaApiError(400, 'INVALID_QUERY', 'libraryId is required')
        const query = queryParam(url.searchParams, 'query', { maxLength: 256 }).trim()
        sendJson(res, 200, await client.series({
          libraryId,
          query,
          page: intParam(url.searchParams, 'page', 0, 0, 100000),
          size: intParam(url.searchParams, 'size', 24, 1, 100),
        }))
        return true
      }
      if (segments.length === 3 && segments[0] === 'series' && segments[2] === 'thumbnail') {
        const image = await client.thumbnail(segments[1])
        res.writeHead(200, {
          'content-type': image.contentType,
          'content-length': image.body.length,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        })
        res.end(image.body)
        return true
      }
      sendError(res, 404, 'NOT_FOUND', `No endpoint for ${req.method} ${url.pathname}`)
      return true
    } catch (error) {
      if (error instanceof KomgaApiError) {
        sendError(res, error.status, error.code, error.message)
        return true
      }
      if (error instanceof KomgaError) {
        sendError(res, error.status, error.code, error.message)
        return true
      }
      logger.warn('komga', 'request_failed', { method: req.method, path: url.pathname })
      sendError(res, 500, 'INTERNAL_ERROR', 'Komga request failed')
      return true
    }
  }
}

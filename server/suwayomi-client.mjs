import { randomUUID } from 'node:crypto'
import { makeMangaSearchTerms } from './manga-search-terms.mjs'

/**
 * Server-side client for Suwayomi's GraphQL API.
 *
 * All requests go to one validated `/api/graphql` endpoint derived from
 * LN_SUWAYOMI_URL. Request data is sent as GraphQL variables, redirects are
 * rejected, and no upstream URL or credential is returned to callers.
 */

const GRAPHQL_PATH = '/api/graphql'
const MAX_GRAPHQL_RESPONSE_BYTES = 8 * 1024 * 1024
const MAX_COVER_BYTES = 5 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 8000
const MAX_TIMEOUT_MS = 30000
const MAX_SEARCH_TIMEOUT_MS = 30000
const MAX_PAGE_SIZE = 100
const MAX_IDS = 100
const MAX_SOURCE_COUNT = 1000
const MAX_SEARCH_RESULTS_PER_SOURCE = 1000
const MAX_SEARCH_RESULTS_TOTAL = 1000
const MAX_SEARCH_SNAPSHOT_BYTES = 4 * 1024 * 1024
const MAX_SEARCH_SNAPSHOTS = 16
const SEARCH_SNAPSHOT_TTL_MS = 120_000

const SOURCES_QUERY = `query MangaSources($first: Int!, $offset: Int!) {
  sources(first: $first, offset: $offset) {
    nodes { id name displayName lang iconUrl supportsLatest }
    pageInfo { hasNextPage }
    totalCount
  }
}`

const SOURCE_BY_ID_QUERY = `query MangaSourceById($id: LongString!) {
  source(id: $id) { id name displayName lang iconUrl supportsLatest }
}`

const MANGA_FIELDS = `
  id title author artist description genre status thumbnailUrl sourceId url realUrl initialized
  inLibrary inLibraryAt downloadCount
  latestFetchedChapter { uploadDate }
  source { id name displayName lang }
`

const SEARCH_MUTATION = `mutation SearchManga($input: FetchSourceMangaInput!) {
  fetchSourceManga(input: $input) {
    hasNextPage
    mangas { ${MANGA_FIELDS} }
  }
}`

const DETAIL_QUERY = `query MangaDetails($id: Int!) {
  manga(id: $id) {
    ${MANGA_FIELDS}
  }
  chapterCount: chapters(condition: { mangaId: $id }, first: 1) { totalCount }
}`

const COVER_QUERY = `query MangaCover($id: Int!) { manga(id: $id) { thumbnailUrl } }`

const CHAPTERS_QUERY = `query MangaChapters($id: Int!, $first: Int!, $offset: Int!) {
  manga(id: $id) {
    id initialized
  }
  chapters(
    condition: { mangaId: $id }
    order: [{ by: SOURCE_ORDER, byType: DESC }]
    first: $first
    offset: $offset
  ) {
    nodes {
      id mangaId name url chapterNumber uploadDate pageCount
      isRead isBookmarked isDownloaded lastPageRead lastReadAt
    }
    pageInfo { hasNextPage }
    totalCount
  }
}`

const LIBRARY_QUERY = `query MangaLibrary($first: Int!, $offset: Int!) {
  mangas(condition: { inLibrary: true }, order: [{ by: IN_LIBRARY_AT, byType: DESC }], first: $first, offset: $offset) {
    nodes { ${MANGA_FIELDS} }
    pageInfo { hasNextPage }
    totalCount
  }
}`

const QUEUE_FIELDS = `
  state
  queue {
    position progress state tries
    chapter { id mangaId name pageCount }
    manga { id title }
  }
`

const QUEUE_QUERY = `query MangaDownloadQueue { downloadStatus { ${QUEUE_FIELDS} } }`

const DOWNLOAD_MUTATION = `mutation EnqueueMangaDownloads($ids: [Int!]!) {
  enqueueChapterDownloads(input: { ids: $ids }) { downloadStatus { ${QUEUE_FIELDS} } }
}`

const DEQUEUE_MUTATION = `mutation CancelMangaDownloads($ids: [Int!]!) {
  dequeueChapterDownloads(input: { ids: $ids }) { downloadStatus { ${QUEUE_FIELDS} } }
}`

const SET_LIBRARY_MUTATION = `mutation SetMangaLibrary($id: Int!, $inLibrary: Boolean!) {
  updateManga(input: { id: $id, patch: { inLibrary: $inLibrary } }) {
    manga { ${MANGA_FIELDS} }
  }
}`

const REFRESH_CHAPTERS_MUTATION = `mutation RefreshMangaChapters($input: FetchMangaAndChaptersInput!) {
  fetchMangaAndChapters(input: $input) { manga { id } chapters { id } }
}`

const REFRESH_LIBRARY_MUTATION = `mutation RefreshMangaLibrary($input: UpdateLibraryInput!) {
  updateLibrary(input: $input) { updateStatus { __typename } }
}`

const HEALTH_QUERY = `query MangaHealth {
  aboutServer { version }
  sources(first: 100) { nodes { id } pageInfo { hasNextPage } }
  chapters(first: 1) { nodes { id isRead isDownloaded } totalCount }
}`

export class SuwayomiError extends Error {
  constructor(code, message, status = 502, details = {}) {
    super(message)
    this.name = 'SuwayomiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

function safeTimeout(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS
  return Math.max(1000, Math.min(MAX_TIMEOUT_MS, Math.trunc(parsed)))
}

function parseBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return { endpoint: null, origin: null }
  let base
  try {
    base = new URL(value.trim())
  } catch {
    throw new SuwayomiError('INVALID_CONFIGURATION', 'LN_SUWAYOMI_URL must be a valid HTTP(S) origin', 503)
  }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new SuwayomiError('INVALID_CONFIGURATION', 'LN_SUWAYOMI_URL must be an HTTP(S) origin without credentials, path, query, or fragment', 503)
  }
  return { endpoint: new URL(GRAPHQL_PATH, base.origin).href, origin: base.origin }
}

export function readSuwayomiConfig(env = process.env) {
  return {
    url: env.LN_SUWAYOMI_URL || env.SUWAYOMI_URL || '',
    username: env.LN_SUWAYOMI_USERNAME || env.SUWAYOMI_USERNAME || '',
    password: env.LN_SUWAYOMI_PASSWORD || env.SUWAYOMI_PASSWORD || '',
    timeoutMs: safeTimeout(env.LN_SUWAYOMI_TIMEOUT_MS || env.SUWAYOMI_TIMEOUT_MS),
  }
}

function numericId(value, label = 'id') {
  const text = String(value ?? '')
  if (!/^(0|[1-9]\d*)$/.test(text)) {
    throw new SuwayomiError('INVALID_ID', `${label} must be a non-negative numeric Suwayomi ID`, 400)
  }
  const id = Number(text)
  if (!Number.isSafeInteger(id)) throw new SuwayomiError('INVALID_ID', `${label} is outside the supported range`, 400)
  return id
}

function boundedInteger(value, fallback, min, max, label) {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new SuwayomiError('INVALID_ARGUMENT', `${label} must be an integer from ${min} to ${max}`, 400)
  }
  return number
}

function asString(value) {
  return value === null || value === undefined ? null : String(value)
}

function asIsoDate(value) {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null
  let epoch
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    epoch = Number(value)
    if (epoch > 0 && epoch < 10_000_000_000) epoch *= 1000
  } else {
    epoch = Date.parse(String(value))
  }
  if (!Number.isFinite(epoch)) return null
  try { return new Date(epoch).toISOString() } catch { return null }
}

function normalizedGenres(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string')
  if (typeof value === 'string' && value.trim()) return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
  return []
}

function sourceDto(source) {
  if (!source || typeof source !== 'object') return null
  if (source.id === null || typeof source.name !== 'string' || typeof source.lang !== 'string') {
    throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned incomplete source data', 502)
  }
  return {
    id: asString(source.id) ?? '',
    name: asString(source.displayName) ?? asString(source.name) ?? '',
    displayName: asString(source.displayName) ?? asString(source.name) ?? '',
    lang: asString(source.lang) ?? '',
    isLocal: String(source.id) === '0',
  }
}

function mangaDto(manga, { chapterCount = manga?.chapters?.totalCount ?? null, origin = '' } = {}) {
  if (!manga || typeof manga !== 'object') return null
  const id = asString(manga.id) ?? ''
  const downloadCount = manga.downloadCount
  if (!id || typeof manga.title !== 'string' || manga.sourceId === null || manga.sourceId === undefined ||
      typeof manga.initialized !== 'boolean' || typeof manga.inLibrary !== 'boolean' || !Number.isInteger(downloadCount)) {
    throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned incomplete manga data', 502)
  }
  const source = sourceDto(manga.source)
  const sourceId = asString(manga.sourceId) ?? source?.id ?? ''
  const safeUrl = safePublicSourceUrl(manga.realUrl ?? manga.url, origin)
  return {
    id,
    title: asString(manga.title) ?? '',
    author: asString(manga.author),
    artist: asString(manga.artist),
    description: asString(manga.description),
    genre: normalizedGenres(manga.genre),
    thumbnailUrl: manga.thumbnailUrl ? `/api/manga/${encodeURIComponent(id)}/cover` : null,
    sourceId,
    source,
    url: safeUrl,
    status: asString(manga.status) ?? 'UNKNOWN',
    inLibrary: manga.inLibrary === true,
    subscribed: manga.inLibrary === true,
    addedAt: asIsoDate(manga.inLibraryAt),
    chapterCount: Number.isInteger(Number(chapterCount)) && chapterCount !== null ? Number(chapterCount) : null,
    downloadCount,
    updatedAt: asIsoDate(manga.latestFetchedChapter?.uploadDate),
  }
}

function safePublicSourceUrl(raw, upstreamOrigin) {
  if (!raw) return null
  let url
  try { url = new URL(String(raw)) } catch { return null }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (upstreamOrigin && url.origin === upstreamOrigin)) return null
  if (url.port && !['80', '443'].includes(url.port)) return null
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.includes(':')) return null
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return null
  }
  return url.href
}

function chapterDto(chapter) {
  if (!chapter || typeof chapter !== 'object' || chapter.id === null || chapter.mangaId === null ||
      typeof chapter.name !== 'string' || typeof chapter.isRead !== 'boolean' || typeof chapter.isDownloaded !== 'boolean' ||
      chapter.uploadDate === null || chapter.uploadDate === undefined || !Number.isInteger(chapter.pageCount)) {
    throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned incomplete chapter data', 502)
  }
  return {
    id: asString(chapter.id) ?? '',
    mangaId: asString(chapter.mangaId) ?? '',
    name: asString(chapter.name) ?? '',
    uploadDate: asIsoDate(chapter.uploadDate),
    read: chapter.isRead === true,
    downloaded: chapter.isDownloaded === true,
    pageCount: chapter.pageCount,
  }
}

function taskState(raw) {
  const state = String(raw ?? '').toUpperCase()
  if (state === 'ERROR') return 'failed'
  if (state === 'FINISHED') return 'completed'
  if (state === 'DOWNLOADING') return 'running'
  if (state === 'QUEUED') return 'queued'
  return 'unknown'
}

function taskDto(item) {
  const chapter = item?.chapter
  const manga = item?.manga
  if (!chapter) return null
  if (!chapter.id || chapter.mangaId === null || typeof chapter.name !== 'string' ||
      !['QUEUED', 'DOWNLOADING', 'FINISHED', 'ERROR'].includes(String(item.state)) ||
      (item.progress !== null && item.progress !== undefined &&
        (typeof item.progress !== 'number' || !Number.isFinite(item.progress) || item.progress < 0 || item.progress > 1))) {
    throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned incomplete download queue data', 502)
  }
  const progress = item.progress === null || item.progress === undefined ? null : item.progress
  return {
    id: asString(chapter.id) ?? '',
    mangaId: asString(chapter.mangaId) ?? asString(manga?.id) ?? '',
    title: asString(manga?.title) ?? '',
    chapterId: asString(chapter.id) ?? '',
    chapterName: asString(chapter.name) ?? '',
    state: taskState(item.state),
    upstreamState: String(item.state ?? 'UNKNOWN'),
    percent: progress === null ? null : Math.round(progress * 100),
  }
}

function responseHeader(response, name) {
  return response.headers?.get?.(name) ?? ''
}

async function readLimitedBody(response, maxBytes) {
  const declared = Number(responseHeader(response, 'content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new SuwayomiError('RESPONSE_TOO_LARGE', 'Suwayomi response exceeded the size limit', 502)
  }
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > maxBytes) throw new SuwayomiError('RESPONSE_TOO_LARGE', 'Suwayomi response exceeded the size limit', 502)
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
        throw new SuwayomiError('RESPONSE_TOO_LARGE', 'Suwayomi response exceeded the size limit', 502)
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
    return new SuwayomiError('AUTHENTICATION_FAILED', 'Suwayomi rejected the configured credentials', 502, { upstreamStatus: response.status })
  }
  return new SuwayomiError('UPSTREAM_HTTP_ERROR', `Suwayomi returned HTTP ${response.status}`, 502, { upstreamStatus: response.status })
}

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

async function mapLimit(items, concurrency, fn) {
  const output = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      output[index] = await fn(items[index], index)
    }
  }))
  return output
}

export function createSuwayomiClient(config = readSuwayomiConfig(), options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const now = options.now ?? (() => new Date())
  const timeoutMs = safeTimeout(config.timeoutMs)
  let titleSearchTerms
  let aliasConfigError = null
  try {
    titleSearchTerms = makeMangaSearchTerms(options.env ?? process.env)
  } catch (error) {
    titleSearchTerms = { terms: (query) => [String(query ?? '').trim()].filter(Boolean) }
    aliasConfigError = new SuwayomiError('INVALID_ALIAS_CONFIG', error instanceof Error ? error.message : 'SUWAYOMI_TITLE_ALIASES is invalid', 503)
  }
  const username = String(config.username ?? '')
  const password = String(config.password ?? '')
  let endpoint = null
  let origin = null
  let configError = null

  try {
    if ((username && !password) || (!username && password) || /[:\r\n]/.test(username) || /[\r\n]/.test(password)) {
      throw new SuwayomiError('INVALID_CONFIGURATION', 'Suwayomi credentials must be supplied as a valid username/password pair', 503)
    }
    const parsed = parseBaseUrl(config.url)
    endpoint = parsed.endpoint
    origin = parsed.origin
  } catch (error) {
    configError = error instanceof SuwayomiError ? error : new SuwayomiError('INVALID_CONFIGURATION', 'Suwayomi configuration is invalid', 503)
  }

  const authHeader = username && password
    ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    : null
  const configured = Boolean(endpoint && !configError)

  function requireConfigured() {
    if (configError) throw configError
    if (!configured) throw new SuwayomiError('NOT_CONFIGURED', 'Suwayomi is not configured', 503)
  }

  async function requestUrl(url, init, maxBytes, requestTimeoutMs = timeoutMs) {
    requireConfigured()
    const boundedTimeout = Math.max(1, Math.min(timeoutMs, Math.trunc(requestTimeoutMs)))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), boundedTimeout)
    timer.unref?.()
    try {
      const response = await fetchImpl(url, {
        ...init,
        headers: {
          accept: init?.headers?.accept ?? '*/*',
          ...(authHeader ? { authorization: authHeader } : {}),
          ...init?.headers,
        },
        signal: controller.signal,
        redirect: 'error',
        cache: 'no-store',
      })
      if (!response.ok) throw responseError(response)
      const body = await readLimitedBody(response, maxBytes)
      return { response, body }
    } catch (error) {
      if (error instanceof SuwayomiError) throw error
      if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new SuwayomiError('UPSTREAM_TIMEOUT', `Suwayomi did not respond within ${boundedTimeout} ms`, 504)
      }
      throw new SuwayomiError('UPSTREAM_UNAVAILABLE', 'Suwayomi could not be reached', 502)
    } finally {
      clearTimeout(timer)
    }
  }

  async function graphql(query, variables = {}, requestTimeoutMs = timeoutMs) {
    const { body } = await requestUrl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    }, MAX_GRAPHQL_RESPONSE_BYTES, requestTimeoutMs)
    let parsed
    try {
      parsed = JSON.parse(body.toString('utf8'))
    } catch {
      throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned invalid JSON', 502)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an invalid GraphQL response', 502)
    }
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      const message = String(parsed.errors[0]?.message ?? '')
      const authFailure = /unauthori[sz]ed|authentication required|not authenticated/i.test(message)
      throw new SuwayomiError(authFailure ? 'AUTHENTICATION_FAILED' : 'GRAPHQL_ERROR', authFailure ? 'Suwayomi rejected the configured credentials' : 'Suwayomi could not complete the GraphQL operation', 502)
    }
    if (!parsed.data || typeof parsed.data !== 'object') {
      throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned no GraphQL data', 502)
    }
    return parsed.data
  }

  const initialization = new Map()
  let enqueueTail = Promise.resolve()
  function serializeEnqueue(work) {
    const pending = enqueueTail.then(work, work)
    enqueueTail = pending.then(() => undefined, () => undefined)
    return pending
  }
  async function fetchMangaAndChapters(id) {
    let pending = initialization.get(id)
    if (!pending) {
      pending = graphql(REFRESH_CHAPTERS_MUTATION, {
        input: { id: numericId(id, 'mangaId'), fetchManga: true, fetchChapters: true },
      }).finally(() => initialization.delete(id))
      initialization.set(id, pending)
    }
    const data = await pending
    if (!data.fetchMangaAndChapters || !Array.isArray(data.fetchMangaAndChapters.chapters)) {
      throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete chapter refresh response', 502)
    }
    if (!data.fetchMangaAndChapters?.manga) throw new SuwayomiError('MANGA_NOT_FOUND', 'Suwayomi manga was not found', 404)
  }

  async function countChaptersFor(mangaIds) {
    const ids = [...new Set(mangaIds.map((id) => numericId(id, 'mangaId')))]
    if (ids.length === 0) return new Map()
    if (ids.length > MAX_PAGE_SIZE) throw new SuwayomiError('INVALID_ARGUMENT', `At most ${MAX_PAGE_SIZE} manga counts can be requested at once`, 400)
    const variables = {}
    const declarations = []
    const fields = ids.map((id, index) => {
      const variable = `mangaId${index}`
      variables[variable] = id
      declarations.push(`$${variable}: Int!`)
      return `count${index}: chapters(condition: { mangaId: $${variable} }, first: 1) { totalCount }`
    })
    const data = await graphql(`query CountMangaChapters(${declarations.join(', ')}) { ${fields.join('\n')} }`, variables)
    return new Map(ids.map((id, index) => {
      const totalCount = data[`count${index}`]?.totalCount
      if (!Number.isInteger(totalCount)) throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete chapter count', 502)
      return [String(id), totalCount]
    }))
  }

  async function sources() {
    const found = new Map()
    let offset = 0
    let expectedTotal = null
    let hasNextPage = false
    do {
      const first = Math.min(MAX_PAGE_SIZE, MAX_SOURCE_COUNT - offset)
      const data = await graphql(SOURCES_QUERY, { first, offset })
      const connection = data.sources
      if (!Array.isArray(connection?.nodes) || typeof connection?.pageInfo?.hasNextPage !== 'boolean' || !Number.isInteger(connection.totalCount)) {
        throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete source list', 502)
      }
      if (expectedTotal === null) expectedTotal = connection.totalCount
      for (const item of connection.nodes) {
        // A stale source row may be omitted by a nullable GraphQL node resolver.
        if (item === null) continue
        if (item.id === null || typeof item.name !== 'string' || typeof item.lang !== 'string') {
          throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned incomplete source data', 502)
        }
        const source = sourceDto(item)
        found.set(source.id, source)
      }
      hasNextPage = connection.pageInfo.hasNextPage
      // The stable resolver applies SQL limit/offset before dropping stale rows.
      // Even an entirely empty visible page can represent a full SQL window.
      if (!hasNextPage) break
      offset += first
    } while (hasNextPage && offset < Math.min(MAX_SOURCE_COUNT, expectedTotal))
    return {
      sources: [...found.values()],
      totalCount: expectedTotal ?? found.size,
      hasNextPage: hasNextPage && offset >= MAX_SOURCE_COUNT,
      fetchedAt: now().toISOString(),
    }
  }

  async function resolveSource(sourceAlias, availableSources) {
    const wanted = new Set(titleSearchTerms.terms(String(sourceAlias), { chinese: true }).map(normalizeSearchText))
    const matches = availableSources.filter((source) => {
      if (String(source.id) === String(sourceAlias)) return true
      return [source.name, source.displayName, source.lang].some((name) =>
        titleSearchTerms.terms(String(name), { chinese: true }).some((variant) => wanted.has(normalizeSearchText(variant))),
      )
    })
    if (matches.length === 0 && /^(0|[1-9]\d*)$/.test(String(sourceAlias))) {
      const data = await graphql(SOURCE_BY_ID_QUERY, { id: String(sourceAlias) })
      if (data.source) {
        const direct = sourceDto(data.source)
        if (direct.id === String(sourceAlias)) return direct
      }
    }
    if (matches.length === 0) throw new SuwayomiError('UNKNOWN_SOURCE', 'No Suwayomi source matches sourceId', 400)
    const unique = [...new Map(matches.map((item) => [String(item.id), item])).values()]
    if (unique.length > 1) throw new SuwayomiError('AMBIGUOUS_SOURCE', 'sourceId matches more than one source; use its numeric ID', 400)
    return unique[0]
  }

  async function searchOne(source, query, type, page, maxResults, deadline) {
    const variants = type === 'SEARCH'
      ? titleSearchTerms.terms(query, { chinese: /^zh(?:-|$)/i.test(source.lang) }).slice(0, 4)
      : ['']
    const collected = new Map()
    let hasNextPage = false
    let truncated = false
    const variantErrors = []
    for (const variant of variants) {
      if (collected.size > maxResults) {
        truncated = true
        break
      }
      try {
        const remaining = deadline - Date.now()
        if (remaining <= 0) throw new SuwayomiError('UPSTREAM_TIMEOUT', 'Suwayomi search exceeded its time limit', 504)
        const data = await graphql(SEARCH_MUTATION, {
          input: {
            source: String(source.id),
            type,
            page,
            ...(type === 'SEARCH' ? { query: variant } : {}),
          },
        }, remaining)
        const result = data.fetchSourceManga
        if (!Array.isArray(result?.mangas) || typeof result?.hasNextPage !== 'boolean') {
          throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete source search', 502)
        }
        hasNextPage ||= result?.hasNextPage === true
        const rawMangas = result.mangas
        if (rawMangas.length > maxResults) truncated = true
        for (const raw of rawMangas.slice(0, maxResults)) {
          const manga = mangaDto(raw, { chapterCount: null, origin })
          if (manga) collected.set(manga.id, manga)
          if (collected.size > maxResults) {
            truncated = true
            break
          }
        }
      } catch (error) {
        variantErrors.push(error)
      }
    }
    if (collected.size === 0 && variantErrors.length === variants.length && variants.length > 0) {
      throw variantErrors[0]
    }
    return {
      source,
      mangas: [...collected.values()].slice(0, maxResults),
      hasNextPage,
      truncated,
      error: variantErrors.length > 0 ? { sourceId: String(source.id), message: 'source search was partially unavailable', retryable: true } : null,
    }
  }

  const searchSnapshots = new Map()

  function searchPage(snapshot, resultId, page, offset, limit) {
    const mangas = snapshot.mangas.slice(offset, offset + limit)
    const nextOffset = offset + mangas.length < snapshot.mangas.length ? offset + mangas.length : null
    return {
      mangas, resultId, page, offset, nextOffset,
      hasNextPage: nextOffset !== null || snapshot.hasUpstreamNext,
      truncated: snapshot.truncated,
      errors: snapshot.errors,
      fetchedAt: snapshot.fetchedAt,
    }
  }

  async function searchManga({ query = '', sourceId = '', type = 'SEARCH', page = 1, offset = 0, limit = 20, resultId = '' } = {}) {
    if (aliasConfigError) throw aliasConfigError
    const text = String(query ?? '').trim()
    if (text.length > 200) throw new SuwayomiError('INVALID_ARGUMENT', 'query must be 200 characters or fewer', 400)
    const normalizedType = String(type ?? 'SEARCH').toUpperCase()
    if (!['SEARCH', 'POPULAR', 'LATEST'].includes(normalizedType)) {
      throw new SuwayomiError('INVALID_ARGUMENT', 'type must be SEARCH, POPULAR, or LATEST', 400)
    }
    if (normalizedType === 'SEARCH' && !text) throw new SuwayomiError('INVALID_ARGUMENT', 'query is required for SEARCH', 400)
    const boundedPage = boundedInteger(page, 1, 1, 10000, 'page')
    const boundedOffset = boundedInteger(offset, 0, 0, MAX_SEARCH_RESULTS_TOTAL, 'offset')
    const boundedLimit = boundedInteger(limit, 20, 1, MAX_PAGE_SIZE, 'limit')
    const snapshotKey = JSON.stringify([text, String(sourceId ?? '').trim(), normalizedType, boundedPage])
    const time = now().getTime()
    for (const [id, snapshot] of searchSnapshots) {
      if (snapshot.expiresAt <= time) searchSnapshots.delete(id)
    }
    if (boundedOffset > 0) {
      const snapshot = searchSnapshots.get(resultId)
      if (snapshot?.key !== snapshotKey || boundedOffset >= snapshot.mangas.length) {
        throw new SuwayomiError('SEARCH_PAGE_EXPIRED', 'Search results changed or expired; restart the manga search', 409)
      }
      return searchPage(snapshot, resultId, boundedPage, boundedOffset, boundedLimit)
    }
    const listed = await sources()
    let selectedSources = listed.sources
    if (String(sourceId ?? '').trim()) {
      selectedSources = [await resolveSource(String(sourceId).trim(), listed.sources)]
    } else {
      selectedSources = [...listed.sources].sort((a, b) => {
        const aZh = /^zh/i.test(a.lang) ? 0 : 1
        const bZh = /^zh/i.test(b.lang) ? 0 : 1
        return aZh - bZh || a.name.localeCompare(b.name)
      })
    }
    if (selectedSources.length === 0) {
      return { mangas: [], resultId: null, hasNextPage: false, truncated: false, page: boundedPage, offset: boundedOffset, nextOffset: null, errors: [], fetchedAt: now().toISOString() }
    }

    const deadline = Date.now() + MAX_SEARCH_TIMEOUT_MS
    const outcomes = await mapLimit(selectedSources, 4, async (source) => {
      try {
        const maxResults = String(sourceId ?? '').trim() ? MAX_SEARCH_RESULTS_PER_SOURCE : 100
        return { ok: true, value: await searchOne(source, text, normalizedType, boundedPage, maxResults, deadline) }
      } catch (error) {
        return { ok: false, source, error }
      }
    })
    const successful = outcomes.filter((item) => item.ok).map((item) => item.value)
    const failed = outcomes.filter((item) => !item.ok)
    if (successful.length === 0 && failed.length > 0) {
      throw new SuwayomiError('SOURCE_SEARCH_FAILED', 'No Suwayomi sources could complete the search', 502, {
        failedSources: failed.map(({ source }) => String(source.id)),
      })
    }

    const bySource = successful.map((item) => item.mangas)
    const merged = []
    const seen = new Set()
    let resultBytes = 0
    let resultLimitHit = false
    merge: for (let index = 0; ; index++) {
      let found = false
      for (const list of bySource) {
        const manga = list[index]
        if (!manga) continue
        found = true
        const key = `${manga.sourceId}:${manga.id}`
        if (seen.has(key)) continue
        const bytes = Buffer.byteLength(JSON.stringify(manga))
        if (merged.length >= MAX_SEARCH_RESULTS_TOTAL || resultBytes + bytes > MAX_SEARCH_SNAPSHOT_BYTES) {
          resultLimitHit = true
          break merge
        }
        resultBytes += bytes
        seen.add(key)
        merged.push(manga)
      }
      if (!found) break
    }
    const snapshot = {
      key: snapshotKey,
      mangas: merged,
      truncated: listed.hasNextPage || successful.some((item) => item.truncated) || resultLimitHit,
      hasUpstreamNext: successful.some((item) => item.hasNextPage),
      errors: [
        ...failed.map(({ source }) => ({ sourceId: String(source.id), message: 'source search unavailable', retryable: true })),
        ...successful.map((item) => item.error).filter(Boolean),
      ],
      fetchedAt: now().toISOString(),
      expiresAt: now().getTime() + SEARCH_SNAPSHOT_TTL_MS,
    }
    const id = merged.length > boundedLimit ? randomUUID() : null
    if (id) {
      if (searchSnapshots.size >= MAX_SEARCH_SNAPSHOTS) searchSnapshots.delete(searchSnapshots.keys().next().value)
      searchSnapshots.set(id, snapshot)
    }
    return searchPage(snapshot, id, boundedPage, 0, boundedLimit)
  }

  async function getManga(id) {
    const mangaId = numericId(id, 'mangaId')
    let data = await graphql(DETAIL_QUERY, { id: mangaId })
    if (!Object.hasOwn(data, 'manga') || !Object.hasOwn(data, 'chapterCount')) {
      throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete manga detail response', 502)
    }
    if (!data.manga) throw new SuwayomiError('MANGA_NOT_FOUND', 'Suwayomi manga was not found', 404)
    if (data.manga.initialized !== true) {
      await fetchMangaAndChapters(String(mangaId))
      data = await graphql(DETAIL_QUERY, { id: mangaId })
      if (!Object.hasOwn(data, 'manga') || !Object.hasOwn(data, 'chapterCount')) {
        throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete manga detail response', 502)
      }
      if (!data.manga) throw new SuwayomiError('MANGA_NOT_FOUND', 'Suwayomi manga was not found', 404)
    }
    if (!Number.isInteger(data.chapterCount?.totalCount)) throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete chapter count', 502)
    return mangaDto(data.manga, { chapterCount: data.chapterCount.totalCount, origin })
  }

  async function getChapters(mangaId, { limit = 50, offset = 0 } = {}) {
    const id = numericId(mangaId, 'mangaId')
    const first = boundedInteger(limit, 50, 1, MAX_PAGE_SIZE, 'limit')
    const start = boundedInteger(offset, 0, 0, 1000000, 'offset')
    let data = await graphql(CHAPTERS_QUERY, { id, first, offset: start })
    if (!Object.hasOwn(data, 'manga') || !Object.hasOwn(data, 'chapters')) {
      throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete chapter list', 502)
    }
    if (!data.manga) throw new SuwayomiError('MANGA_NOT_FOUND', 'Suwayomi manga was not found', 404)
    if (data.manga.initialized !== true) {
      await fetchMangaAndChapters(String(id))
      data = await graphql(CHAPTERS_QUERY, { id, first, offset: start })
      if (!Object.hasOwn(data, 'manga') || !Object.hasOwn(data, 'chapters')) {
        throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete chapter list', 502)
      }
      if (!data.manga) throw new SuwayomiError('MANGA_NOT_FOUND', 'Suwayomi manga was not found', 404)
    }
    const connection = data.chapters
    if (!Array.isArray(connection?.nodes) || !Number.isInteger(connection?.totalCount) || typeof connection?.pageInfo?.hasNextPage !== 'boolean') {
      throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete chapter list', 502)
    }
    const chapters = connection.nodes.map(chapterDto)
    return {
      chapters,
      totalCount: connection.totalCount,
      hasNextPage: connection?.pageInfo?.hasNextPage === true,
      fetchedAt: now().toISOString(),
    }
  }

  async function library({ limit = 50, offset = 0 } = {}) {
    const first = boundedInteger(limit, 50, 1, MAX_PAGE_SIZE, 'limit')
    const start = boundedInteger(offset, 0, 0, 1000000, 'offset')
    const data = await graphql(LIBRARY_QUERY, { first, offset: start })
    const connection = data.mangas
    if (!Array.isArray(connection?.nodes) || !Number.isInteger(connection?.totalCount) || typeof connection?.pageInfo?.hasNextPage !== 'boolean') {
      throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete manga library', 502)
    }
    const mangas = connection.nodes.map((item) => mangaDto(item, { chapterCount: null, origin }))
    const chapterCounts = await countChaptersFor(mangas.map((manga) => manga.id))
    for (const manga of mangas) manga.chapterCount = chapterCounts.get(manga.id) ?? null
    return {
      mangas: mangas.filter(Boolean),
      totalCount: Number.isInteger(connection?.totalCount) ? connection.totalCount : null,
      hasNextPage: connection?.pageInfo?.hasNextPage === true,
      fetchedAt: now().toISOString(),
    }
  }

  async function getQueue() {
    const data = await graphql(QUEUE_QUERY)
    const status = data.downloadStatus
    if (!status || !['STARTED', 'STOPPED'].includes(String(status.state)) || !Array.isArray(status.queue)) {
      throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete download queue', 502)
    }
    const queue = status.queue.map(taskDto).filter(Boolean)
    return { queue, state: String(status.state), count: queue.length, fetchedAt: now().toISOString() }
  }

  async function chapterStates(ids) {
    const variables = {}
    const fields = ids.map((id, index) => {
      const key = `chapter${index}`
      const variable = `id${index}`
      variables[variable] = numericId(id, `chapterIds[${index}]`)
      return `${key}: chapter(id: $${variable}) { id mangaId isDownloaded }`
    })
    const declarations = ids.map((_, index) => `$id${index}: Int!`).join(', ')
    const data = await graphql(`query ValidateMangaChapters(${declarations}) { ${fields.join('\n')} }`, variables)
    return ids.map((_id, index) => {
      const chapter = data[`chapter${index}`]
      if (!chapter) return null
      if (chapter.id === null || chapter.mangaId === null || typeof chapter.isDownloaded !== 'boolean') {
        throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned incomplete chapter status data', 502)
      }
      return { id: String(chapter.id), mangaId: String(chapter.mangaId), downloaded: chapter.isDownloaded }
    })
  }

  async function download({ mangaId, chapterIds = [] } = {}) {
    const parentId = numericId(mangaId, 'mangaId')
    if (!Array.isArray(chapterIds) || chapterIds.length === 0 || chapterIds.length > MAX_IDS) {
      throw new SuwayomiError('INVALID_CHAPTERS', `chapterIds must contain 1 to ${MAX_IDS} IDs`, 400)
    }
    const requested = [...new Set(chapterIds.map((id, index) => numericId(id, `chapterIds[${index}]`)))].map(String)
    return serializeEnqueue(async () => {
      const manga = await getManga(String(parentId))
      if (manga.sourceId === '0') {
        throw new SuwayomiError('LOCAL_SOURCE', 'Local manga chapters are already stored on the server and cannot be downloaded again', 409)
      }
      const states = await chapterStates(requested)
      for (const chapter of states) {
        if (!chapter) throw new SuwayomiError('CHAPTER_NOT_FOUND', 'One or more chapter IDs do not exist', 404)
        if (chapter.mangaId !== String(parentId)) throw new SuwayomiError('CHAPTER_MANGA_MISMATCH', 'Every chapter must belong to the selected manga', 400)
      }
      const current = await getQueue()
      const queuedIds = new Set(current.queue.map((task) => task.chapterId))
      const skipped = []
      const enqueueIds = []
      for (const chapter of states) {
        if (chapter.downloaded || queuedIds.has(chapter.id)) skipped.push(chapter.id)
        else enqueueIds.push(numericId(chapter.id, 'chapterId'))
      }
      if (enqueueIds.length === 0) return { queued: [], skipped, completed: [], unconfirmed: [], queue: current.queue }
      let queue = []
      try {
        const data = await graphql(DOWNLOAD_MUTATION, { ids: enqueueIds })
        const status = data.enqueueChapterDownloads?.downloadStatus
        if (!Array.isArray(status?.queue)) throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned no download queue after enqueue', 502)
        queue = status.queue.map(taskDto).filter(Boolean)
      } catch {
        // The mutation may have taken effect. Read state back; never replay it.
      }
      const requestedForEnqueue = enqueueIds.map(String)
      const queued = new Set()
      const completed = new Set()
      const observeQueue = () => {
        for (const task of queue) {
          if (!requestedForEnqueue.includes(task.chapterId)) continue
          if (task.state === 'completed') {
            completed.add(task.chapterId)
            queued.delete(task.chapterId)
          } else if (!completed.has(task.chapterId)) {
            queued.add(task.chapterId)
          }
        }
      }
      const pending = () => requestedForEnqueue.filter((id) => !queued.has(id) && !completed.has(id))
      observeQueue()
      if (pending().length > 0) {
        try {
          queue = (await getQueue()).queue
          observeQueue()
        } catch {
          // The mutation may have succeeded. Read state back without replaying it.
        }
      }
      const remaining = pending()
      if (remaining.length) {
        try {
          const readback = await chapterStates(remaining)
          for (const chapter of readback) if (chapter?.downloaded) completed.add(chapter.id)
        } catch {
          // Keep unresolved IDs explicit; a later queue read can confirm them.
        }
      }
      // `queued` reports IDs observed in the upstream queue, not newly created jobs.
      return {
        queued: [...queued], skipped, completed: [...completed], unconfirmed: pending(),
        queue, fetchedAt: now().toISOString(),
      }
    })
  }

  async function tasks({ action = 'list', chapterIds = [] } = {}) {
    const normalized = String(action ?? 'list').toLowerCase()
    if (normalized === 'list' || normalized === 'status') return getQueue()
    if (normalized !== 'cancel') throw new SuwayomiError('INVALID_ACTION', 'action must be list, status, or cancel', 400)
    if (!Array.isArray(chapterIds) || chapterIds.length === 0 || chapterIds.length > MAX_IDS) {
      throw new SuwayomiError('INVALID_CHAPTERS', `chapterIds must contain 1 to ${MAX_IDS} IDs`, 400)
    }
    const ids = [...new Set(chapterIds.map((id, index) => numericId(id, `chapterIds[${index}]`)))]
    const data = await graphql(DEQUEUE_MUTATION, { ids })
    const status = data.dequeueChapterDownloads?.downloadStatus
    if (!status || !['STARTED', 'STOPPED'].includes(String(status.state)) || !Array.isArray(status.queue)) {
      throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete download queue after cancel', 502)
    }
    const queue = status.queue.map(taskDto).filter(Boolean)
    return { queue, state: String(status.state), count: queue.length, fetchedAt: now().toISOString() }
  }

  async function setLibrary({ mangaId, inLibrary } = {}) {
    const id = numericId(mangaId, 'mangaId')
    if (typeof inLibrary !== 'boolean') throw new SuwayomiError('INVALID_ARGUMENT', 'inLibrary must be a boolean', 400)
    let data
    try {
      data = await graphql(SET_LIBRARY_MUTATION, { id, inLibrary })
    } catch (error) {
      if (error?.code === 'GRAPHQL_ERROR') {
        throw new SuwayomiError('LIBRARY_UPDATE_FAILED', 'Suwayomi could not update manga library membership', 502)
      }
      throw error
    }
    const manga = data.updateManga?.manga
    if (!manga) throw new SuwayomiError('MANGA_NOT_FOUND', 'Suwayomi manga was not found', 404)
    const updated = await getManga(String(id))
    if (updated.inLibrary !== inLibrary) {
      throw new SuwayomiError('LIBRARY_UPDATE_CONFLICT', 'Suwayomi did not confirm the requested library membership', 409)
    }
    return updated
  }

  async function refreshChapters(mangaId) {
    const id = numericId(mangaId, 'mangaId')
    await fetchMangaAndChapters(String(id))
    return getChapters(String(id), { limit: 50, offset: 0 })
  }

  async function refreshLibrary({ categoryIds } = {}) {
    const input = {}
    if (categoryIds !== undefined) {
      if (!Array.isArray(categoryIds) || categoryIds.length > 100) {
        throw new SuwayomiError('INVALID_ARGUMENT', 'categoryIds must contain at most 100 numeric IDs', 400)
      }
      if (categoryIds.length > 0) {
        input.categories = [...new Set(categoryIds.map((id, index) => numericId(id, `categoryIds[${index}]`)))]
      }
    }
    const data = await graphql(REFRESH_LIBRARY_MUTATION, { input })
    return { accepted: Boolean(data.updateLibrary?.updateStatus), fetchedAt: now().toISOString() }
  }

  async function health() {
    if (!configured) {
      return {
        reachable: false,
        authenticated: null,
        compatible: false,
        installedSources: null,
        chapters: null,
        message: configError ? configError.message : 'Suwayomi is not configured',
      }
    }
    try {
      const data = await graphql(HEALTH_QUERY)
      const sourceNodes = data.sources?.nodes
      const chapterConnection = data.chapters
      if (!data.aboutServer || typeof data.aboutServer.version !== 'string' || !Array.isArray(sourceNodes) ||
          typeof data.sources?.pageInfo?.hasNextPage !== 'boolean' || !Array.isArray(chapterConnection?.nodes) ||
          !Number.isInteger(chapterConnection.totalCount)) {
        throw new SuwayomiError('INVALID_RESPONSE', 'Suwayomi returned an incomplete health response', 502)
      }
      return {
        reachable: true,
        // Successful access to these fields proves Suwayomi's GraphQL auth gate accepted the request.
        authenticated: true,
        compatible: true,
        installedSources: data.sources.pageInfo.hasNextPage
          ? null
          : sourceNodes.filter((source) => String(source.id) !== '0').length,
        chapters: chapterConnection.totalCount > 0 ? true : null,
        version: data.aboutServer.version,
      }
    } catch (error) {
      const authFailed = error?.code === 'AUTHENTICATION_FAILED'
      const graphqlFailure = error?.code === 'GRAPHQL_ERROR' || error?.code === 'INVALID_RESPONSE'
      const reachable = error?.code !== 'UPSTREAM_UNAVAILABLE' && error?.code !== 'UPSTREAM_TIMEOUT'
      return {
        reachable,
        authenticated: authFailed ? false : null,
        compatible: graphqlFailure ? false : null,
        installedSources: null,
        chapters: graphqlFailure ? false : null,
        message: error instanceof SuwayomiError ? error.message : 'Suwayomi health check failed',
      }
    }
  }

  async function cover(id) {
    const mangaId = numericId(id, 'mangaId')
    const manga = await graphql(COVER_QUERY, { id: mangaId })
    if (!manga.manga) throw new SuwayomiError('MANGA_NOT_FOUND', 'Suwayomi manga was not found', 404)
    const raw = String(manga.manga.thumbnailUrl ?? '')
    if (!raw) throw new SuwayomiError('COVER_NOT_FOUND', 'Suwayomi manga has no cover image', 404)
    let thumbnail
    try { thumbnail = new URL(raw, origin) } catch {
      throw new SuwayomiError('INVALID_COVER_URL', 'Suwayomi returned an unsupported cover URL', 502)
    }
    if (thumbnail.origin !== origin || thumbnail.username || thumbnail.password || thumbnail.search || thumbnail.hash) {
      throw new SuwayomiError('INVALID_COVER_URL', 'Suwayomi returned an unsupported cover URL', 502)
    }
    const allowedPath = new RegExp(`^/api/v1/manga/${mangaId}/thumbnail/?$`)
    if (!allowedPath.test(thumbnail.pathname)) {
      throw new SuwayomiError('INVALID_COVER_URL', 'Suwayomi returned an unsupported cover path', 502)
    }
    const { response, body } = await requestUrl(thumbnail.href, { method: 'GET', headers: { accept: 'image/*' } }, MAX_COVER_BYTES)
    const contentType = responseHeader(response, 'content-type').split(';')[0].trim().toLowerCase()
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(contentType)) {
      throw new SuwayomiError('INVALID_COVER_TYPE', 'Suwayomi returned an unsupported cover image type', 502)
    }
    return { contentType, body }
  }

  return Object.freeze({
    configured,
    health,
    sources,
    searchManga,
    getManga,
    getChapters,
    library,
    download,
    tasks,
    setLibrary,
    refreshChapters,
    refreshLibrary,
    cover,
  })
}

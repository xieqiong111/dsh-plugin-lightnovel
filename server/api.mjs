/**
 * /api/* router for the web console.
 *
 * Every handler goes straight to PluginRuntime — the same SearchEngine,
 * NovelService, TaskManager and Library that back the six Cordis tools. There
 * is no fixture/mock branch here: an empty result is an empty result.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { TaskManagerError } from '../dist/core/tasks.js'
import { createSuwayomiClient } from './suwayomi-client.mjs'
import { createMangaApi } from './manga-api.mjs'
import { createKomgaClient } from './komga-client.mjs'
import { createKomgaApi } from './komga-api.mjs'
import { rank, resolveBook } from '../dist/search.js'
import { assertSafePublicUrl, safeResolve } from '../dist/util/paths.js'
import {
  toActivities,
  toLibraryItem,
  toLibraryStats,
  toNovel,
  toSources,
  toStatus,
  toTask,
  toVolume,
} from './mapping.mjs'

const MAX_BODY = 64 * 1024

class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } })
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body exceeds 64 KB')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return parsed
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Expected a JSON object')
  }
}

function tokenMatches(req, expected) {
  if (!expected) return true
  const candidates = [
    req.headers['x-ln-token'],
    /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? ''))?.[1],
  ].filter(Boolean)
  const wanted = Buffer.from(expected)
  return candidates.some((value) => {
    const given = Buffer.from(String(value))
    return given.length === wanted.length && timingSafeEqual(given, wanted)
  })
}

/** Volume ids are `${bookId}#v${index}`; fall back to exact names, then "all". */
function volumeSelector(ids, names) {
  const indices = []
  for (const id of ids) {
    const match = /#v(\d+)$/.exec(String(id)) || /^v?(\d+)$/.exec(String(id))
    if (!match) return null
    const index = Number(match[1])
    if (!Number.isInteger(index) || index < 1) return null
    indices.push(index)
  }
  if (indices.length > 0) return [...new Set(indices)].sort((a, b) => a - b).join(',')
  if (names.length === 0) return 'all'
  for (const name of names) {
    if (typeof name !== 'string' || name.length === 0 || name.length > 120 || /[\\/\r\n]|\.\./.test(name)) {
      throw new HttpError(400, 'INVALID_VOLUME_NAME', 'Volume names contain unsupported characters')
    }
  }
  return names.join(',')
}

export function createApi(
  runtime,
  settings,
  logger,
  mangaClient = runtime.suwayomi ?? createSuwayomiClient(),
  komgaClient = runtime.komga ?? createKomgaClient(),
) {
  const handleMangaApi = createMangaApi(mangaClient, logger, {
    missingBffAuth: settings.mangaCredentialsConfigured && !settings.token,
  })
  const handleKomgaApi = createKomgaApi(komgaClient, logger, {
    missingBffAuth: settings.komgaCredentialsConfigured && !settings.token,
  })
  const searchUrlConfigured = Boolean(
    process.env.LN_BILINOVEL_SEARCH_URL || process.env.LN_WENKU8_SEARCH_URL,
  )

  async function listNovels(params) {
    const query = (params.get('query') ?? '').trim()
    const sources = (params.get('sources') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const status = params.get('status') ?? 'all'
    const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 20))
    const statusFilter = status === 'all' ? undefined : status

    if (query) {
      const outcome = await runtime.search.search({
        query,
        sources,
        status: statusFilter,
        limit,
        refresh: params.get('refresh') === 'true',
      })
      return {
        results: outcome.results.map(toNovel),
        total: outcome.total,
        degradedSources: outcome.degradedSources.map(
          (id) => `${id}：该源未返回关键词命中（可能未提供公开搜索端点）`,
        ),
        mocked: false,
        tookMs: outcome.tookMs,
        sourcesQueried: outcome.sourcesQueried,
      }
    }

    // Empty keyword = dashboard/featured view. Never touches the network: only
    // the local index and offline sources are listed, ranked deterministically.
    await runtime.index.load()
    const allowed = new Set(sources.length ? sources : runtime.registry.enabled.map((s) => s.info.id))
    const candidates = runtime.index.all().filter((book) => allowed.has(book.sourceId))
    for (const adapter of runtime.registry.enabled) {
      if (adapter.info.live || !allowed.has(adapter.info.id)) continue
      const books = await adapter.search('', {
        config: runtime.config,
        fetcher: runtime.fetcher,
        logger: runtime.logger,
      })
      candidates.push(...books)
    }
    const hits = rank(candidates, '', statusFilter, limit)
    return {
      results: hits.map(toNovel),
      total: hits.length,
      degradedSources: [],
      mocked: false,
      tookMs: 0,
      sourcesQueried: ['local-index', ...runtime.registry.enabled.filter((s) => !s.info.live).map((s) => s.info.id)],
    }
  }

  async function findBook(id) {
    try {
      return resolveBook(runtime.index, runtime.registry, { bookId: id }).book
    } catch {
      throw new HttpError(404, 'BOOK_NOT_FOUND', `Unknown book id: ${id}`)
    }
  }

  async function novelDetail(id) {
    const indexed = runtime.index.find(id)
    if (!indexed) await findBook(id) // validates the id even without an index row
    if (runtime.dartAvailable) {
      try {
        // includeVolumes keeps volumeCount truthful; the /volumes endpoint uses
        // the same Dart command and returns the chapter-level detail.
        const result = await runtime.novels.details({ bookId: id }, true)
        return result.novel
      } catch (error) {
        logger.warn('webapi', 'details_fallback', { bookId: id, error: String(error) })
      }
    }
    if (indexed) return indexed
    return findBook(id)
  }

  async function novelVolumes(id) {
    await findBook(id)
    if (!runtime.dartAvailable) return []
    try {
      const result = await runtime.novels.volumes({ bookId: id })
      return result.volumes.map((volume) => toVolume(id, volume))
    } catch (error) {
      logger.warn('webapi', 'volumes_failed', { bookId: id, error: String(error) })
      throw new HttpError(502, 'VOLUMES_FAILED', String(error))
    }
  }

  async function createTask(body) {
    if (typeof body.bookId !== 'string' || !body.bookId.trim()) {
      throw new HttpError(400, 'EMPTY_BOOK_REFERENCE', 'bookId is required')
    }
    if (!runtime.dartAvailable) {
      throw new HttpError(503, 'DART_UNAVAILABLE', 'Dart headless core is unavailable; downloads are disabled')
    }
    if (!Array.isArray(body.volumes) || body.volumes.length === 0) {
      throw new HttpError(400, 'EMPTY_VOLUMES', 'Select at least one volume')
    }
    const names = Array.isArray(body.volumeNames)
      ? body.volumeNames.map((name) => String(name ?? '').trim()).filter(Boolean)
      : []
    const selector = volumeSelector(body.volumes, names)
    if (!selector) throw new HttpError(400, 'INVALID_VOLUMES', 'Unrecognised volume ids')
    if (body.volumes.length > runtime.config.maxVolumesPerTask) {
      throw new HttpError(400, 'TOO_MANY_VOLUMES', `At most ${runtime.config.maxVolumesPerTask} volumes per task`)
    }

    const { book, adapter } = resolveBook(runtime.index, runtime.registry, {
      bookId: body.bookId.trim(),
      source: typeof body.source === 'string' ? body.source : undefined,
    })
    if (adapter.info.access === 'restricted') {
      throw new HttpError(403, 'RESTRICTED_SOURCE', 'Login/paywall sources are never used by this console')
    }
    if (runtime.config.offlineOnly && book.sourceId !== 'fixture') {
      throw new HttpError(403, 'OFFLINE_ONLY', 'offlineOnly=true permits only the fixture source')
    }
    if (!book.sourceUrl.startsWith('fixture://')) {
      assertSafePublicUrl(book.sourceUrl, adapter.hosts)
    }

    const task = await runtime.tasks.start({
      bookId: book.id,
      sourceId: book.sourceId,
      source: book.source,
      sourceUrl: book.sourceUrl,
      title: book.title,
      author: book.author,
      volumes: selector,
      volumeNames: names.length ? names : selector === 'all' ? [] : selector.split(','),
      combine: body.combine === true,
      addChapterTitle: body.addChapterTitle !== false,
    })
    logger.info('webapi', 'task_created', { taskId: task.id, bookId: book.id, volumes: selector })
    return toTask(task)
  }

  async function libraryFile(id, req, res) {
    const entry = runtime.library.get(id)
    if (!entry) throw new HttpError(404, 'FILE_NOT_FOUND', `Unknown library entry: ${id}`)
    const absolute = safeResolve(runtime.config.libraryDir, entry.relativePath)
    const info = await stat(absolute).catch(() => {
      throw new HttpError(404, 'FILE_MISSING', 'EPUB file is missing from disk')
    })
    const name = path.basename(entry.relativePath)
    res.writeHead(200, {
      'content-type': 'application/epub+zip',
      'content-length': info.size,
      'content-disposition': `attachment; filename="download.epub"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(absolute)
      .on('error', () => res.destroy())
      .pipe(res)
  }

  /** Returns true when the request was handled as /api/*. */
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/')) return false
    if (!tokenMatches(req, settings.token)) {
      sendError(res, 401, 'UNAUTHORIZED', 'Missing or invalid X-LN-Token')
      return true
    }

    if (await handleMangaApi(req, res, url)) return true
    if (await handleKomgaApi(req, res, url)) return true

    const segments = url.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => {
        try {
          return decodeURIComponent(segment)
        } catch {
          throw new HttpError(400, 'INVALID_PATH', 'Malformed percent-encoding')
        }
      })
    const method = req.method ?? 'GET'

    try {
      if (method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { ok: true, dart: runtime.dartAvailable, uptime: Math.round(process.uptime()) })
        return true
      }
      if (method === 'GET' && url.pathname === '/api/status') {
        sendJson(res, 200, toStatus(runtime, settings))
        return true
      }
      if (method === 'GET' && url.pathname === '/api/sources') {
        sendJson(res, 200, toSources(runtime, searchUrlConfigured))
        return true
      }
      if (method === 'GET' && url.pathname === '/api/activities') {
        sendJson(res, 200, toActivities(logger))
        return true
      }

      if (url.pathname === '/api/novels' && method === 'GET') {
        sendJson(res, 200, await listNovels(url.searchParams))
        return true
      }
      if (segments[1] === 'novels' && segments.length === 3 && method === 'GET') {
        const novel = toNovel(await novelDetail(segments[2]))
        sendJson(res, 200, novel)
        return true
      }
      if (segments[1] === 'novels' && segments.length === 4 && segments[3] === 'volumes' && method === 'GET') {
        sendJson(res, 200, await novelVolumes(segments[2]))
        return true
      }

      if (url.pathname === '/api/tasks' && method === 'GET') {
        const state = url.searchParams.get('state')
        const tasks = runtime.tasks.list({ limit: 200 }).map(toTask)
        sendJson(res, 200, state ? tasks.filter((task) => task.state === state) : tasks)
        return true
      }
      if (url.pathname === '/api/tasks' && method === 'POST') {
        sendJson(res, 201, await createTask(await readBody(req)))
        return true
      }
      if (segments[1] === 'tasks' && segments.length === 4 && method === 'POST') {
        const record =
          segments[3] === 'cancel'
            ? await runtime.tasks.cancel(segments[2])
            : segments[3] === 'retry'
              ? await runtime.tasks.retry(segments[2])
              : null
        if (!record) throw new HttpError(404, 'UNKNOWN_ACTION', `Unknown task action: ${segments[3]}`)
        sendJson(res, 200, toTask(record))
        return true
      }

      if (url.pathname === '/api/library' && method === 'GET') {
        await runtime.library.load()
        const entries = runtime.library.list({ query: url.searchParams.get('query') ?? '', limit: 200 })
        sendJson(res, 200, entries.map(toLibraryItem))
        return true
      }
      if (url.pathname === '/api/library/stats' && method === 'GET') {
        await runtime.library.load()
        sendJson(res, 200, toLibraryStats(runtime))
        return true
      }
      if (segments[1] === 'library' && segments.length === 4 && segments[3] === 'verify' && method === 'POST') {
        const results = await runtime.library.verify(segments[2])
        const result = results[0]
        if (!result) throw new HttpError(404, 'FILE_NOT_FOUND', `Unknown library entry: ${segments[2]}`)
        sendJson(res, 200, {
          ok: result.ok,
          id: result.id,
          integrity: result.ok ? 'passed' : 'failed',
          problems: result.problems,
          sha256Changed: result.sha256Changed,
        })
        return true
      }
      if (segments[1] === 'library' && segments.length === 4 && segments[3] === 'file' && ['GET', 'HEAD'].includes(method)) {
        await libraryFile(segments[2], req, res)
        return true
      }
      if (segments[1] === 'library' && segments.length === 3 && method === 'DELETE') {
        if (!settings.allowDelete) {
          throw new HttpError(403, 'DELETE_DISABLED', 'Set LN_BFF_ALLOW_DELETE=true to enable EPUB deletion')
        }
        const removed = await runtime.library.remove(segments[2])
        if (!removed) throw new HttpError(404, 'FILE_NOT_FOUND', `Unknown library entry: ${segments[2]}`)
        sendJson(res, 200, { ok: true, id: segments[2] })
        return true
      }

      sendError(res, 404, 'NOT_FOUND', `No endpoint for ${method} ${url.pathname}`)
      return true
    } catch (error) {
      if (error instanceof HttpError) {
        sendError(res, error.status, error.code, error.message)
        return true
      }
      if (error instanceof TaskManagerError) {
        const status = error.code === 'TASK_NOT_FOUND' ? 404 : 409
        sendError(res, status, error.code, error.message)
        return true
      }
      logger.error('webapi', 'request_failed', { method, path: url.pathname, error: String(error) })
      sendError(res, 500, 'INTERNAL_ERROR', String(error))
      return true
    }
  }
}


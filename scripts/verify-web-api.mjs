/**
 * End-to-end verification for the Lightnovel Studio BFF + built web console.
 *
 * Boots `server/serve.mjs` as a child process on an ephemeral port with a
 * throw-away data/library root, drives the real /api/* surface over HTTP
 * (empty-query featured -> search -> details -> volumes -> download task ->
 * library -> verify -> EPUB), then checks auth, body limits, path traversal,
 * static hosting and opt-in deletion on a second instance that reuses the same
 * isolated data root.
 *
 * No LLM key, no DSH CLI and no network access: everything runs on fixtures.
 * Dart is required for the download leg; point LN_DART_SDK / LN_DART_BINARY at
 * a local toolchain (see README).
 *
 * Exit 0 = the web console and its BFF are genuinely working on this host.
 */
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import {
  mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile,
} from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webDist = process.env.LN_WEB_DIST || path.join(root, 'web', 'dist')

const checks = []
function check(name, condition, detail = '') {
  checks.push({ name, ok: !!condition, detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!condition) process.exitCode = 1
}
function skip(name, detail = '') {
  checks.push({ name, ok: true, skipped: true, detail })
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

function childEnv(port, dataDir, libraryDir, extra = {}) {
  const env = { ...process.env }
  delete env.LN_DATA_DIR
  delete env.LN_LIBRARY_DIR
  delete env.LN_BFF_TOKEN
  delete env.LN_BFF_ALLOW_DELETE
  return {
    ...env,
    LN_BFF_HOST: '127.0.0.1',
    LN_BFF_PORT: String(port),
    LN_BFF_DATA_DIR: dataDir,
    LN_BFF_LIBRARY_DIR: libraryDir,
    LN_WEB_DIST: webDist,
    LN_OFFLINE_ONLY: 'true',
    LN_ENABLED_SOURCES: 'fixture',
    LN_LOG_ECHO: 'false',
    ...extra,
  }
}

function startServer(env, tag) {
  const child = spawn(process.execPath, [path.join(root, 'server', 'serve.mjs')], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log = []
  const keep = (chunk) => {
    log.push(String(chunk))
    if (log.length > 400) log.splice(0, log.length - 400)
  }
  child.stdout.on('data', keep)
  child.stderr.on('data', keep)
  child.on('exit', (code, signal) => keep(`\n[${tag}] exited code=${code} signal=${signal}\n`))
  return { child, log }
}

async function stopServer(instance) {
  const { child } = instance
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const deadline = Date.now() + 5000
  while (child.exitCode === null && Date.now() < deadline) await sleep(100)
  if (child.exitCode === null) child.kill('SIGKILL')
  await sleep(200)
}

async function waitHealth(port, headers = {}, timeoutMs = 45000) {
  const started = Date.now()
  let lastError = ''
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { headers })
      if (response.ok) return await response.json()
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = String(error)
    }
    await sleep(250)
  }
  throw new Error(`server did not become healthy on port ${port}: ${lastError}`)
}

async function request(port, pathname, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const init = { method, headers: { ...headers } }
  if (body !== undefined && !raw) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  } else if (body !== undefined) {
    init.body = body
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, init)
  const contentType = response.headers.get('content-type') || ''
  let payload
  if (contentType.includes('application/json')) payload = await response.json()
  else if (raw || contentType.startsWith('image/') || contentType.includes('epub')) {
    payload = Buffer.from(await response.arrayBuffer())
  } else payload = await response.text()
  return { status: response.status, headers: response.headers, body: payload }
}

/** Raw HTTP request so encoded traversal sequences reach the server unchanged. */
function rawRequest(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function walk(dir) {
  const out = []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(full))
    else out.push(full)
  }
  return out
}

/** Minimal ZIP central-directory reader, enough for EPUB structural checks. */
function readZipEntries(buffer) {
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06])
  const eocd = buffer.lastIndexOf(signature)
  if (eocd < 0) throw new Error('EOCD not found')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = []
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('bad central directory')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const data = buffer.subarray(dataStart, dataStart + uncompressedSize)
    entries.push({ name, method, compressedSize, uncompressedSize, data })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ln-web-verify-'))
const dataDir = path.join(tempRoot, 'data')
const libraryDir = path.join(tempRoot, 'library')
await mkdir(dataDir, { recursive: true })
await mkdir(libraryDir, { recursive: true })

const dartSdk = process.env.LN_DART_SDK || ''
const pubCache = process.env.PUB_CACHE || ''

let current = null
let entryId = null
let epubBuffer = null
let appPort = null

try {
  const hasDist = await stat(path.join(webDist, 'index.html')).then((s) => s.isFile()).catch(() => false)
  check('built frontend exists (web/dist/index.html)', hasDist, hasDist ? webDist : `${webDist} missing; run npm run web:build`)

  appPort = await freePort()
  const instanceA = startServer(
    childEnv(appPort, dataDir, libraryDir, {
      ...(dartSdk ? { LN_DART_SDK: dartSdk } : {}),
      ...(pubCache ? { PUB_CACHE: pubCache } : {}),
    }),
    'bff-a',
  )
  current = instanceA
  const health = await waitHealth(appPort)
  check('GET /api/health', health?.ok === true, `dart=${health?.dart}`)
  check('Dart headless core available', health?.dart === true, 'downloads need a Dart SDK or prebuilt binary')

  // --- status / sources / activities -------------------------------------
  const statusResponse = await request(appPort, '/api/status')
  check('GET /api/status 200', statusResponse.status === 200)
  const status = statusResponse.body
  check('status reports live API mode', status?.apiMode === 'live', status?.apiMode)
  check('status exposes only Dart runner basename',
    typeof status?.dart?.runner === 'string' && !/[\\/]/.test(status.dart.runner),
    String(status?.dart?.runner))
  check('status keeps offline/robots/search-mode flags',
    status?.offlineOnly === true && status?.respectRobots === true && status?.searchMode === 'hybrid',
    `${status?.offlineOnly}/${status?.respectRobots}/${status?.searchMode}`)
  const sourceIds = (status?.sources ?? []).map((source) => source?.id ?? source)
  check('status lists only the fixture source',
    Array.isArray(status?.sources) && sourceIds.length === 1 && sourceIds[0] === 'fixture',
    JSON.stringify(sourceIds))
  check('delete is opt-in (disabled by default)', status?.features?.delete === false)
  check('token is opt-in (disabled by default)', status?.features?.token === false)

  const sources = await request(appPort, '/api/sources')
  check('GET /api/sources', sources.status === 200 && Array.isArray(sources.body) && sources.body.length >= 1,
    `${sources.body?.length} sources`)
  const activities = await request(appPort, '/api/activities')
  check('GET /api/activities', activities.status === 200 && Array.isArray(activities.body),
    `${activities.body?.length} entries`)

  // --- featured (empty query must stay local) -------------------------------
  const featured = await request(appPort, '/api/novels')
  check('empty query returns featured novels without mock data',
    featured.status === 200 && featured.body?.mocked === false && featured.body?.total >= 1,
    `total=${featured.body?.total} mocked=${featured.body?.mocked}`)
  check('featured query never touches the network',
    Array.isArray(featured.body?.sourcesQueried) && featured.body.sourcesQueried.includes('local-index'),
    JSON.stringify(featured.body?.sourcesQueried))
  const featuredHit = featured.body?.results?.find((novel) => novel.title === '星海旅途')
  check('fixture novel present in featured list', !!featuredHit, featuredHit?.id)
  const bookId = featuredHit?.id

  // --- keyword search ------------------------------------------------------
  const search = await request(appPort, `/api/novels?query=${encodeURIComponent('星海')}`)
  check('keyword search returns the fixture hit',
    search.status === 200 && search.body?.total === 1
      && search.body?.results?.[0]?.title === '星海旅途'
      && search.body?.mocked === false,
    `total=${search.body?.total} degraded=${search.body?.degradedSources?.length}`)
  check('search shape includes degradedSources/tookMs',
    Array.isArray(search.body?.degradedSources) && typeof search.body?.tookMs === 'number')

  let detail
  if (bookId) {
    const detailResponse = await request(appPort, `/api/novels/${encodeURIComponent(bookId)}`)
    detail = detailResponse.body
    check('GET /api/novels/:id', detailResponse.status === 200 && detail?.title === '星海旅途',
      `${detail?.title} rating=${detail?.rating}`)
    check('detail does not invent a rating', detail?.rating === 0)
  } else {
    check('detail skipped because no book id', false)
  }

  let volumes = []
  if (bookId) {
    const volumesResponse = await request(appPort, `/api/novels/${encodeURIComponent(bookId)}/volumes`)
    volumes = volumesResponse.body
    check('GET /api/novels/:id/volumes',
      volumesResponse.status === 200 && Array.isArray(volumes) && volumes.length === 2,
      `${volumes?.length} volumes`)
    check('volume ids are index-encoded',
      volumes.every((volume) => volume.id.startsWith(`${bookId}#v`)))
  }

  // --- task / library closed loop -----------------------------------------
  let taskId = null
  if (bookId && volumes[0]) {
    const created = await request(appPort, '/api/tasks', {
      method: 'POST',
      body: {
        bookId,
        volumes: [volumes[0].id],
        volumeNames: [volumes[0].name],
        addChapterTitle: true,
      },
    })
    taskId = created.body?.id
    check('POST /api/tasks enqueues a durable task',
      created.status === 201 && /^task_/.test(taskId || ''), `${created.status} ${taskId}`)
  }

  let finalTask = null
  if (taskId) {
    for (let i = 0; i < 240; i++) {
      const tasks = await request(appPort, '/api/tasks')
      finalTask = tasks.body?.find((task) => task.id === taskId) ?? null
      if (finalTask && ['completed', 'failed', 'cancelled'].includes(finalTask.state)) break
      await sleep(250)
    }
    check('download task completes through the real Dart bridge',
      finalTask?.state === 'completed' && finalTask?.percent === 100,
      `state=${finalTask?.state} percent=${finalTask?.percent} message=${finalTask?.message ?? ''}`)
    check('completed task is not marked as mock', finalTask?.isMock === false)
  }

  const library = await request(appPort, '/api/library')
  const entry = library.body?.find((item) => item.title === '星海旅途')
  entryId = entry?.id
  check('GET /api/library lists the produced EPUB',
    library.status === 200 && !!entry && entry.integrity === 'passed',
    `${library.body?.length} entries · ${entry?.fileName}`)
  check('library item is not marked as mock', entry && entry.isMock !== true)

  const libraryStats = await request(appPort, '/api/library/stats')
  check('GET /api/library/stats reflects one verified EPUB',
    libraryStats.status === 200 && libraryStats.body?.epubs === 1
      && libraryStats.body?.verified === 1 && libraryStats.body?.bytes > 1000,
    JSON.stringify(libraryStats.body))

  if (entryId) {
    const head = await request(appPort, `/api/library/${encodeURIComponent(entryId)}/file`, { method: 'HEAD' })
    check('HEAD /api/library/:id/file', head.status === 200
      && String(head.headers.get('content-type')).includes('epub+zip')
      && Number(head.headers.get('content-length')) > 1000,
      `${head.headers.get('content-length')} bytes`)

    const file = await request(appPort, `/api/library/${encodeURIComponent(entryId)}/file`, { raw: true })
    epubBuffer = file.body
    check('EPUB download is a real ZIP',
      file.status === 200 && epubBuffer.length > 1000 && epubBuffer.readUInt32LE(0) === 0x04034b50,
      `${epubBuffer.length} bytes`)

    const verified = await request(appPort, `/api/library/${encodeURIComponent(entryId)}/verify`, { method: 'POST' })
    check('POST /api/library/:id/verify passes',
      verified.status === 200 && verified.body?.ok === true && verified.body?.integrity === 'passed',
      JSON.stringify(verified.body?.problems ?? []))

    try {
      const entries = readZipEntries(epubBuffer)
      const mimetype = entries.find((item) => item.name === 'mimetype')
      check('EPUB has an uncompressed application/epub+zip mimetype',
        mimetype && mimetype.method === 0 && mimetype.data.toString() === 'application/epub+zip')
      check('EPUB contains META-INF/container.xml',
        entries.some((item) => item.name === 'META-INF/container.xml'))
    } catch (error) {
      check('EPUB ZIP structure readable', false, String(error))
    }

    const epubFiles = (await walk(libraryDir)).filter((filePath) => filePath.endsWith('.epub'))
    if (epubFiles[0]) {
      const sidecar = await readFile(`${epubFiles[0]}.sha256`, 'utf8').catch(() => '')
      const actual = createHash('sha256').update(epubBuffer).digest('hex')
      const recorded = sidecar.trim().split(/\s+/)[0] || ''
      check('sha256 sidecar matches the served EPUB', recorded === actual,
        `${actual.slice(0, 12)}… vs ${recorded.slice(0, 12)}…`)
    } else {
      check('EPUB exists on disk', false, libraryDir)
    }
  } else {
    check('library/EPUB checks skipped because no entry id', false)
  }

  // --- error paths ---------------------------------------------------------
  const notFound = await request(appPort, '/api/nope')
  check('unknown API route returns structured 404',
    notFound.status === 404 && notFound.body?.error?.code === 'NOT_FOUND')
  const wrongMethod = await request(appPort, '/api/health', { method: 'POST' })
  check('unsupported method returns 404', wrongMethod.status === 404)

  const emptyTask = await request(appPort, '/api/tasks', { method: 'POST', body: {} })
  check('POST /api/tasks rejects an empty body',
    emptyTask.status === 400 && emptyTask.body?.error?.code === 'EMPTY_BOOK_REFERENCE')

  const badVolume = await request(appPort, '/api/tasks', {
    method: 'POST',
    body: { bookId, volumes: ['not-a-volume-id'] },
  })
  check('POST /api/tasks rejects invalid volume ids',
    badVolume.status === 400 && badVolume.body?.error?.code === 'INVALID_VOLUMES')

  const huge = JSON.stringify({ padding: 'x'.repeat(70 * 1024) })
  const tooLarge = await request(appPort, '/api/tasks', { method: 'POST', body: huge, raw: true })
  check('request bodies over 64 KB are rejected with 413',
    tooLarge.status === 413 && tooLarge.body?.error?.code === 'BODY_TOO_LARGE')

  if (entryId) {
    const deleteDefault = await request(appPort, `/api/library/${encodeURIComponent(entryId)}`, { method: 'DELETE' })
    check('DELETE is disabled unless explicitly enabled',
      deleteDefault.status === 403 && deleteDefault.body?.error?.code === 'DELETE_DISABLED')
  }

  const traversal = await rawRequest(appPort, '/%2e%2e%2fpackage.json')
  check('encoded path traversal is rejected', traversal.status === 400, `status=${traversal.status}`)

  // --- static hosting ------------------------------------------------------
  if (hasDist) {
    const index = await request(appPort, '/')
    check('static index.html is served', index.status === 200
      && String(index.headers.get('content-type')).includes('text/html')
      && String(index.body).includes('<div id="root"'), `${String(index.body).length} bytes`)
    const match = /<script[^>]+src="([^"]+)"/.exec(String(index.body))
    if (match) {
      const assetPath = match[1].startsWith('./') ? `/${match[1].slice(2)}` : match[1]
      const asset = await request(appPort, assetPath)
      check('hashed JS bundle is served as javascript',
        asset.status === 200 && String(asset.headers.get('content-type')).includes('javascript'),
        `${assetPath} · ${asset.body.length} bytes`)
    } else {
      check('index.html references a JS bundle', false)
    }
    const fallback = await request(appPort, '/library')
    check('SPA fallback serves index.html for client routes',
      fallback.status === 200 && String(fallback.headers.get('content-type')).includes('text/html'))
  }

  await stopServer(instanceA)
  current = null

  // --- token + delete instance (same isolated library) --------------------
  const token = `verify-${randomBytes(8).toString('hex')}`
  const securedPort = await freePort()
  const instanceB = startServer(
    childEnv(securedPort, dataDir, libraryDir, {
      LN_BFF_TOKEN: token,
      LN_BFF_ALLOW_DELETE: 'true',
      ...(dartSdk ? { LN_DART_SDK: dartSdk } : {}),
      ...(pubCache ? { PUB_CACHE: pubCache } : {}),
    }),
    'bff-b',
  )
  current = instanceB
  await waitHealth(securedPort, { 'x-ln-token': token })

  const unauthorized = await request(securedPort, '/api/health')
  check('token-protected API rejects missing token',
    unauthorized.status === 401 && unauthorized.body?.error?.code === 'UNAUTHORIZED')
  const authorized = await request(securedPort, '/api/health', { headers: { 'x-ln-token': token } })
  check('X-LN-Token grants access', authorized.status === 200 && authorized.body?.ok === true)
  const bearer = await request(securedPort, '/api/health', { headers: { authorization: `Bearer ${token}` } })
  check('Authorization Bearer token also works', bearer.status === 200)

  if (entryId) {
    const deleted = await request(securedPort, `/api/library/${encodeURIComponent(entryId)}`, {
      method: 'DELETE',
      headers: { 'x-ln-token': token },
    })
    check('DELETE works when LN_BFF_ALLOW_DELETE=true',
      deleted.status === 200 && deleted.body?.ok === true)
    const after = await request(securedPort, '/api/library', { headers: { 'x-ln-token': token } })
    check('library no longer lists the deleted EPUB',
      after.status === 200 && after.body?.length === 0)
    const fileGone = await request(securedPort, `/api/library/${encodeURIComponent(entryId)}/file`, {
      headers: { 'x-ln-token': token },
    })
    check('deleted EPUB file returns 404', fileGone.status === 404)
  }
} catch (error) {
  check('verification completed without exception', false, String(error?.stack || error))
  if (current?.log?.length) {
    console.log('\n--- server log (tail) ---')
    console.log(current.log.join('').slice(-6000))
  }
} finally {
  await stopServer(current)
  await rm(tempRoot, { recursive: true, force: true }).catch(() => {})
}

const failed = checks.filter((item) => !item.ok).length
const skipped = checks.filter((item) => item.skipped).length
console.log(`\nRESULT ${checks.length - failed - skipped}/${checks.length - skipped} checks passed` +
  `${skipped ? ` (${skipped} skipped)` : ''} on ${process.platform}/${process.arch}`)
if (failed) console.log(`RESULT FAILED (${failed} failures)`)
process.exit(failed ? 1 : 0)

/**
 * Real-network (LIVE) scraping verification for dsh-plugin-lightnovel.
 *
 * Unlike scripts/verify-nas.mjs (offline fixtures), this script boots a REAL
 * DeepSeek Harness runtime and dispatches the six tools against public web
 * pages over the network. It is the reproducible evidence that the vendored
 * Dart scraper, chapter restore, image embedding and EPUB packing work on
 * live site data — not just on fixtures.
 *
 * Compliance contract (deliberately strict, do not relax):
 *   - public http(s) pages only, robots.txt fetched and honoured;
 *   - polite per-host rate limiting (config requestIntervalMs);
 *   - no cookies, no Authorization, no login, no paywall, no Cloudflare bypass;
 *   - restricted sources (wenku8) stay disabled;
 *   - ONE volume is downloaded by default to keep the request count minimal.
 *
 * Usage (inside the deployed container):
 *   node /opt/lightnovel/scripts/verify-live.mjs
 *
 * Environment overrides:
 *   LN_LIVE_DETAIL_URL      public detail page (default: 安达与岛村 / 2059)
 *   LN_LIVE_VOLUME          1-based volume index (default: 1)
 *   LN_LIVE_QUERY           keyword used to check honest search degradation
 *   LN_LIVE_ALLOW_DOWNLOAD  set to 0 for a read-only (no EPUB) verification
 *   LN_LIVE_DATA_DIR        isolated data root (default: /data/live-verify)
 *   LN_LIVE_TIMEOUT_MS      overall task timeout (default: 20 min)
 */
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { readFile, stat } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const detailUrl = process.env.LN_LIVE_DETAIL_URL || 'https://www.bilinovel.net/novel/2059.html'
const volumeIndex = Number(process.env.LN_LIVE_VOLUME || '1')
const query = process.env.LN_LIVE_QUERY || '安达与岛村'
const allowDownload = process.env.LN_LIVE_ALLOW_DOWNLOAD !== '0'
const dataDir = process.env.LN_LIVE_DATA_DIR || '/data/live-verify'
const taskTimeoutMs = Number(process.env.LN_LIVE_TIMEOUT_MS || 20 * 60 * 1000)
const fixturesDir = process.env.LN_FIXTURES_DIR || path.join(root, 'test', 'fixtures')
const dartBinary = process.env.LN_DART_BINARY || '/opt/bnp/bnp_headless'

const checks = []
function check(name, condition, detail = '') {
  checks.push({ name, ok: !!condition, detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!condition) process.exitCode = 1
}

let seq = 0
async function call(ctx, name, args) {
  const batch = await ctx.tools.execute({
    calls: [{ type: 'tool-call', id: `live_${++seq}`, name, arguments: JSON.stringify(args) }],
    signal: new AbortController().signal,
  })
  const settled = batch.results[0]
  if (!settled) throw new Error(`no result for ${name}`)
  const result = settled.result
  if (result?.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`)
  const value = result?.value
  // Tools deliberately return `{ ok: false, error }` instead of throwing, so
  // surface it here — otherwise every downstream assertion degrades to a
  // meaningless "undefined".
  if (value && typeof value === 'object' && value.ok === false) {
    console.log(`  TOOL_ERROR ${name}: ${JSON.stringify(value.error)}`)
  }
  return value
}

/** Minimal ZIP reader (stored + deflate) used to inspect the produced EPUB. */
function readZipEntries(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('EOCD not found — not a ZIP')
  const count = buf.readUInt16LE(eocd + 10)
  let cursor = buf.readUInt32LE(eocd + 16)
  const entries = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(cursor) !== 0x02014b50) break
    const method = buf.readUInt16LE(cursor + 10)
    const compSize = buf.readUInt32LE(cursor + 20)
    const nameLen = buf.readUInt16LE(cursor + 28)
    const extraLen = buf.readUInt16LE(cursor + 30)
    const commentLen = buf.readUInt16LE(cursor + 32)
    const localOffset = buf.readUInt32LE(cursor + 42)
    const name = buf.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8')
    const localNameLen = buf.readUInt16LE(localOffset + 26)
    const localExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    let content
    try { content = method === 0 ? raw : inflateRawSync(raw) } catch { content = Buffer.alloc(0) }
    entries.push({ name, method, bytes: content.length, content })
    cursor += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

console.log('LIVE VERIFICATION — public pages only, robots.txt honoured, no credentials')
console.log(`detailUrl=${detailUrl} volume=${volumeIndex} download=${allowDownload} dataDir=${dataDir}`)

const ctx = new Context()
let fiber
try {
  // --- Preflight: robots.txt is reachable and we never send credentials. ---
  const origin = new URL(detailUrl).origin
  const robotsResponse = await fetch(`${origin}/robots.txt`, {
    signal: AbortSignal.timeout(20_000),
    credentials: 'omit',
    headers: { 'User-Agent': 'dsh-plugin-lightnovel/1.0 (+polite crawler; 1 request / 4s)' },
  })
  const robotsText = await robotsResponse.text()
  check('public robots.txt reachable over real network',
    robotsResponse.status === 200 && /User-agent:/i.test(robotsText),
    `http=${robotsResponse.status} bytes=${robotsText.length}`)
  check('detail path is not disallowed by robots.txt',
    !robotsText.split('\n').some((line) => /disallow:\s*\/novel/i.test(line)))

  const secretEnv = Object.keys(process.env).filter((k) => /^(LN_|DSH_).*(TOKEN|KEY|SECRET|COOKIE|PASSWORD|AUTH)/i.test(k))
  check('no credential/secret environment supplied to the runtime', secretEnv.length === 0,
    secretEnv.join(',') || 'none')

  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)

  const plugin = await import(path.join(root, 'dist', 'index.js'))
  check('plugin exports Cordis contract',
    plugin.name === 'dsh-plugin-lightnovel' && plugin.inject.includes('tools')
      && typeof plugin.apply === 'function' && !!plugin.Config)

  fiber = ctx.plugin(plugin, {
    dataDir,
    // The image sets LN_LIBRARY_DIR=/data/library; pin it under dataDir so one
    // verification run never mixes its evidence with the real user library.
    libraryDir: path.join(dataDir, 'library'),
    fixturesDir,
    dartBinary,
    offlineOnly: false,
    enabledSources: ['bilinovel'],
    searchMode: 'live',
    respectRobots: true,
    requestIntervalMs: 4000,
    searchTimeoutMs: 60_000,
    taskTimeoutMs,
    maxVolumesPerTask: 1,
    maxConcurrentDownloads: 1,
    logLevel: 'info',
  })
  await fiber.await?.()

  const names = ctx.tools.schemas().map((t) => t.name).sort()
  const expected = ['novel_details', 'novel_download', 'novel_library', 'novel_search', 'novel_tasks', 'novel_volumes']
  check('six native tools registered in real ToolsService',
    expected.every((n) => names.includes(n)), names.join(', '))

  // --- Live detail page: the Dart core performs a real HTTP GET. ---
  const details = await call(ctx, 'novel_details', { url: detailUrl })
  const novel = details?.novel
  check('novel_details scraped the LIVE public detail page',
    details?.ok && !!novel?.title && novel.title !== `Book 2059` && !!novel?.coverUrl,
    `title=${novel?.title} author=${novel?.author} publisher=${novel?.publisher}`)
  check('live details are structured (description + tags + canonical URL)',
    (novel?.description || '').length > 20 && (novel?.tags || []).length > 0
      && /^https:\/\/www\.bilinovel\.net\/novel\/\d+\.html$/.test(novel?.sourceUrl || ''),
    `desc=${(novel?.description || '').length} chars tags=${(novel?.tags || []).length} url=${novel?.sourceUrl}`)

  // --- Live catalog page: real volumes and real chapter URLs. ---
  const volumes = await call(ctx, 'novel_volumes', { url: detailUrl })
  const firstVolume = volumes?.volumes?.[0]
  check('novel_volumes scraped the LIVE public catalog',
    volumes?.ok && volumes?.totalVolumes > 1 && volumes?.totalChapters > 1,
    `volumes=${volumes?.totalVolumes} chapters=${volumes?.totalChapters}`)
  check('catalog chapters point at real public chapter URLs',
    /^https?:\/\//.test(firstVolume?.chapters?.[0]?.url || '') || /\/\d+\.html/.test(firstVolume?.chapters?.[0]?.url || ''),
    `vol1=${firstVolume?.name} chapters=${firstVolume?.chapterCount} first=${firstVolume?.chapters?.[0]?.name}`)

  // --- Honest search behaviour: no fake keyword hits from a "hot titles" page. ---
  const search = await call(ctx, 'novel_search', { query, refresh: true })
  check('live keyword search degrades honestly (no fabricated hits)',
    search?.ok && (search?.degradedSources || []).includes('bilinovel')
      && !(search?.results || []).some((r) => r.sourceId === 'bilinovel'),
    `total=${search?.total} degraded=${JSON.stringify(search?.degradedSources)}`)

  // --- Optional: one real EPUB download (public chapter pages + covers). ---
  if (allowDownload) {
    const started = await call(ctx, 'novel_download', {
      url: detailUrl,
      volumes: String(volumeIndex),
      volumeNames: [volumes.volumes[volumeIndex - 1].name],
      addChapterTitle: true,
    })
    const taskId = started?.taskId
    check('novel_download enqueued a LIVE download task',
      started?.ok && /^task_/.test(taskId || ''), taskId)

    let final
    const deadline = Date.now() + taskTimeoutMs
    while (Date.now() < deadline) {
      const status = await call(ctx, 'novel_tasks', { action: 'get', taskId })
      if (['completed', 'failed', 'cancelled'].includes(status?.task?.state)) { final = status.task; break }
      await new Promise((r) => setTimeout(r, 2000))
    }
    check('live download task completed',
      final?.state === 'completed',
      `state=${final?.state} error=${JSON.stringify(final?.error)}`)

    const artifact = final?.artifacts?.[0]
    check('live EPUB artifact verified (sha256 + integrity)',
      artifact?.integrity === 'ok' && /^[a-f0-9]{64}$/.test(artifact?.sha256 || ''),
      `bytes=${artifact?.bytes} sha=${artifact?.sha256?.slice(0, 12)}… chapters=${final?.downloadedChapters?.length}`)

    if (artifact?.path) {
      const size = (await stat(artifact.path)).size
      const buf = await readFile(artifact.path)
      check('EPUB is a real non-empty ZIP on disk',
        size > 1000 && buf.readUInt32LE(0) === 0x04034b50, `${size} bytes`)
      const entries = readZipEntries(buf)
      const mimetype = entries.find((e) => e.name === 'mimetype')
      const xhtml = entries.filter((e) => /\.xhtml$/i.test(e.name))
      const images = entries.filter((e) => /\.(png|jpe?g|gif|webp)$/i.test(e.name))
      check('EPUB container has valid mimetype + OPF + XHTML',
        mimetype?.content.toString('utf8').trim() === 'application/epub+zip'
          && entries.some((e) => /\.opf$/i.test(e.name)) && xhtml.length >= 1,
        `entries=${entries.length} xhtml=${xhtml.length} images=${images.length}`)
      const text = xhtml.map((e) => e.content.toString('utf8')).join('')
      check('EPUB contains real Chinese chapter text / illustration from the site',
        /[\u4e00-\u9fff]{20,}/.test(text) && text.length > 500,
        `xhtmlText=${text.length} chars`)
    }

    const lib = await call(ctx, 'novel_library', { action: 'list' })
    check('novel_library lists the live EPUB',
      lib?.ok && (lib?.entries || []).some((e) => e.integrity === 'ok'),
      `entries=${lib?.entries?.length}`)
    const verify = await call(ctx, 'novel_library', { action: 'verify' })
    check('library re-verification passes for live data', verify?.allOk === true)
  } else {
    console.log('SKIP  live EPUB download (LN_LIVE_ALLOW_DOWNLOAD=0)')
  }

  const status = await call(ctx, 'novel_tasks', { action: 'status' })
  check('Dart core available for live scraping', status?.status?.dart?.available === true,
    String(status?.status?.dart?.runner || status?.status?.dart?.reason))
} catch (error) {
  check('verification completed without exception', false, String(error?.stack || error))
} finally {
  await fiber?.dispose?.()
  await ctx?.dispose?.()
}

const passed = checks.filter((c) => c.ok).length
console.log(`\nRESULT ${passed}/${checks.length} checks passed (LIVE ${new URL(detailUrl).host}) on ${process.platform}/${process.arch}`)
if (process.exitCode) console.log('RESULT FAILED')
process.exit(process.exitCode ?? 0)

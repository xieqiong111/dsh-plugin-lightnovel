/**
 * Standalone post-deploy verification for the NAS image.
 *
 * Boots a REAL DeepSeek Harness runtime (Cordis Context + ToolsService +
 * SystemPrompt + NativeToolExecutor), loads dist/index.js through
 * ctx.plugin(), then dispatches the six tools through ctx.tools.execute() and
 * walks the full closed loop: search -> details -> volumes -> download ->
 * tasks (progress) -> library, finally verifying the produced EPUB.
 *
 * No vitest / network / LLM key required. All I/O is offline fixture data.
 * Exit 0 = deployed plugin genuinely loads and works on this host.
 *
 * Usage inside the container:
 *   node /opt/lightnovel/scripts/verify-nas.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDir = process.env.LN_FIXTURES_DIR || path.join(root, 'test', 'fixtures')
const dartBinary = process.env.LN_DART_BINARY || '/opt/bnp/bnp_headless'
// Hermetic verification: the image sets LN_LIBRARY_DIR=/data/library, which is
// the operator's real book shelf. Pin everything under a dedicated subtree so
// repeated runs cannot pollute (or be poisoned by) production library state.
const dataDir = path.join(process.env.LN_DATA_DIR || '/data', 'nas-verify')
await mkdir(dataDir, { recursive: true })

const checks = []
function check(name, condition, detail = '') {
  checks.push({ name, ok: !!condition, detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!condition) process.exitCode = 1
}

let seq = 0
async function call(ctx, name, args) {
  const batch = await ctx.tools.execute({
    calls: [{ type: 'tool-call', id: `nas_${++seq}`, name, arguments: JSON.stringify(args) }],
    signal: new AbortController().signal,
  })
  const settled = batch.results[0]
  if (!settled) throw new Error(`no result for ${name}`)
  const result = settled.result
  if (result?.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`)
  return result?.value
}

const ctx = new Context()
let fiber
try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)

  const plugin = await import(path.join(root, 'dist', 'index.js'))
  check('plugin exports Cordis contract',
    plugin.name === 'dsh-plugin-lightnovel' && plugin.inject.includes('tools')
      && typeof plugin.apply === 'function' && !!plugin.Config)

  fiber = ctx.plugin(plugin, {
    dataDir,
    libraryDir: path.join(dataDir, 'library'),
    fixturesDir,
    dartBinary,
    offlineOnly: true,
    enabledSources: ['fixture'],
    searchMode: 'hybrid',
    respectRobots: true,
    requestIntervalMs: 0,
    maxConcurrentDownloads: 1,
    logLevel: 'info',
  })
  await fiber.await?.()

  const names = ctx.tools.schemas().map((t) => t.name).sort()
  const expected = ['novel_details', 'novel_download', 'novel_library', 'novel_search', 'novel_tasks', 'novel_volumes']
  check('six native tools registered in real ToolsService',
    expected.every((n) => names.includes(n)), names.join(', '))

  const search = await call(ctx, 'novel_search', { query: '星海旅途' })
  const hit = search?.results?.find((r) => r.title === '星海旅途')
  check('novel_search returns structured hits', search?.ok && !!hit,
    hit ? `${hit.id} score=${hit.score}` : `total=${search?.total}`)
  const bookId = hit?.id
  if (!bookId) throw new Error('no book id from search')

  const traditional = await call(ctx, 'novel_search', { query: '月下的茶館' })
  check('traditional/simplified matching',
    traditional?.results?.some((r) => r.title === '月下的茶館'))

  const details = await call(ctx, 'novel_details', { bookId })
  check('novel_details via Dart scraper',
    details?.ok && details?.novel?.title === '星海旅途' && details?.novel?.author === '測試作者',
    `${details?.novel?.title} / ${details?.novel?.author}`)

  const volumes = await call(ctx, 'novel_volumes', { bookId })
  check('novel_volumes lists volumes + chapters',
    volumes?.ok && volumes?.totalVolumes === 2 && volumes?.totalChapters === 5,
    `volumes=${volumes?.totalVolumes} chapters=${volumes?.totalChapters}`)

  const started = await call(ctx, 'novel_download', {
    bookId, volumes: '1', volumeNames: ['第一卷 启程'], addChapterTitle: true,
  })
  const taskId = started?.taskId
  check('novel_download enqueues durable task', started?.ok && /^task_/.test(taskId || ''), taskId)

  let final
  for (let i = 0; i < 80; i++) {
    const status = await call(ctx, 'novel_tasks', { action: 'get', taskId })
    const state = status?.task?.state
    if (['completed', 'failed', 'cancelled'].includes(state)) { final = status.task; break }
    await new Promise((r) => setTimeout(r, 250))
  }
  check('task completed with real chapters/volumes recorded',
    final?.state === 'completed'
      && final?.downloadedChapters?.length === 3
      && final?.downloadedVolumes?.length === 1,
    `state=${final?.state} chapters=${final?.downloadedChapters?.length} error=${JSON.stringify(final?.error)}`)

  const artifact = final?.artifacts?.[0]
  check('EPUB integrity verified', artifact?.integrity === 'ok' && /^[a-f0-9]{64}$/.test(artifact?.sha256 || ''),
    artifact ? `bytes=${artifact.bytes} sha=${artifact.sha256?.slice(0, 12)}…` : 'no artifact')

  if (artifact?.path) {
    const size = (await stat(artifact.path)).size
    const buf = await readFile(artifact.path)
    check('EPUB is a real non-empty ZIP on NAS disk',
      size > 1000 && buf.readUInt32LE(0) === 0x04034b50, `${size} bytes`)
  }

  const lib = await call(ctx, 'novel_library', { action: 'list' })
  check('novel_library lists verified EPUB',
    lib?.ok && lib?.entries?.length >= 1 && lib.entries[0].integrity === 'ok',
    `entries=${lib?.entries?.length}`)
  const verify = await call(ctx, 'novel_library', { action: 'verify' })
  check('library re-verification passes', verify?.allOk === true)

  const status = await call(ctx, 'novel_tasks', { action: 'status' })
  check('Dart core detected on NAS', status?.status?.dart?.available === true,
    String(status?.status?.dart?.runner || status?.status?.dart?.reason))
} catch (error) {
  check('verification completed without exception', false, String(error?.stack || error))
} finally {
  await fiber?.dispose?.()
  await ctx?.dispose?.()
}

const passed = checks.filter((c) => c.ok).length
console.log(`\nRESULT ${passed}/${checks.length} checks passed on ${process.platform}/${process.arch}`)
if (process.exitCode) console.log('RESULT FAILED')
process.exit(process.exitCode ?? 0)

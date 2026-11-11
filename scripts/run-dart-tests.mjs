/**
 * Compile the vendored Dart headless core and run an end-to-end offline pack.
 *
 * This proves the preserved upstream scraper/EPUB pipeline actually produces a
 * valid EPUB; `npm run test:dart` is intentionally separate from vitest so the
 * suite still runs on machines without a Dart SDK. When LN_DART_EPUB is set,
 * test/unit/integrity.test.ts additionally verifies the produced artifact.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const project = join(root, 'vendor', 'bili_novel_packer')
const fixtures = join(root, 'test', 'fixtures')
const out = join(root, '.test-output', 'dart-pack')
const binary = process.env.LN_DART_BINARY || join(project, 'build', 'bnp_headless')
const dartSdk = process.env.LN_DART_SDK || ''
const dart = dartSdk ? join(dartSdk, 'bin', 'dart') : process.env.LN_DART || 'dart'
const pubEnv = {
  ...process.env,
  PUB_CACHE: process.env.PUB_CACHE || join(root, '.pub-cache'),
  PUB_HOSTED_URL: process.env.PUB_HOSTED_URL || 'https://pub.flutter-io.cn',
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: project, encoding: 'utf8', env: pubEnv, ...options })
  if (result.status !== 0) {
    console.error(`[dart-tests] command failed: ${cmd} ${args.join(' ')}`)
    console.error(result.stderr || result.stdout || '')
    process.exit(result.status ?? 1)
  }
  return result.stdout || ''
}

function hasDart() {
  const probe = spawnSync(dart, ['--version'], { encoding: 'utf8', env: pubEnv })
  return probe.status === 0
}

if (!existsSync(binary)) {
  if (!hasDart()) {
    console.warn('[dart-tests] Dart SDK not found and no prebuilt binary; skipping Dart checks.')
    console.warn('[dart-tests] Set LN_DART_BINARY or LN_DART_SDK to enable them.')
    process.exit(0)
  }
  console.log('[dart-tests] compiling bnp_headless ...')
  run(dart, ['pub', 'get'])
  run(dart, ['compile', 'exe', 'bin/headless.dart', '-o', binary])
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const common = [
  '--source', 'fixture',
  '--url', 'fixture://novel/star-voyage.html',
  '--fixtures', fixtures,
  '--allowed-sources', 'fixture',
]

const details = run(binary, ['details', ...common])
const detailsLine = details.trim().split('\n').map((l) => JSON.parse(l)).find((e) => e.type === 'result')
if (!detailsLine?.data?.novel?.title) throw new Error('details did not return a novel')
console.log(`[dart-tests] details OK: ${detailsLine.data.novel.title}`)

const volumes = run(binary, ['volumes', ...common])
const volumesLine = volumes.trim().split('\n').map((l) => JSON.parse(l)).find((e) => e.type === 'result')
if (volumesLine?.data?.volumes?.length !== 2) throw new Error('volumes did not return 2 volumes')
console.log(`[dart-tests] volumes OK: ${volumesLine.data.volumes.length} volumes`)

const pack = run(binary, [
  'pack', ...common,
  '--output-dir', out,
  '--volumes', '1',
  '--combine', 'false',
  '--add-chapter-title', 'true',
])
const lines = pack.trim().split('\n').map((l) => JSON.parse(l))
const result = lines.find((e) => e.type === 'result')
if (!result?.data?.artifacts?.length) throw new Error('pack did not return artifacts')
const progress = lines.filter((e) => e.type === 'progress')
if (progress.length < 3) throw new Error(`expected progress events, got ${progress.length}`)

const epub = result.data.artifacts[0].path
const size = readFileSync(epub).length
if (size < 1000) throw new Error(`EPUB too small: ${size} bytes`)
console.log(`[dart-tests] pack OK: ${progress.length} progress events, EPUB ${size} bytes`)
console.log(`[dart-tests] LN_DART_EPUB=${epub}`)
console.log('[dart-tests] ALL_OK')

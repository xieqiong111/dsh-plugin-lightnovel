/**
 * Requirement #12, part 2: verify the real `dsh` CLI accepts the bundle and
 * composes its patch layer into a profile. This is the exact command the
 * official publishing docs recommend (`dsh --profile <name> --dump-config`).
 *
 * It creates an isolated $DSH_HOME with a minimal profile whose
 * `dsh.profile.bundles` lists our package, symlinks the package in, and runs
 * the installed `@deepseek-ai/dsh` binary. No network and no real user HOME is
 * touched.
 */
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cli = path.join(packageRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

let home: string
let dump: string

beforeAll(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'ln-dsh-cli-'))
  const profile = path.join(home, 'profiles', 'lntest')
  await mkdir(path.join(profile, 'node_modules', '@deepseek-ai'), { recursive: true })

  await writeFile(path.join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-lntest',
    private: true,
    type: 'module',
    dependencies: { '@deepseek-ai/dsh-base': '0.2.2-rc.1', 'dsh-plugin-lightnovel': `link:${packageRoot}` },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-plugin-lightnovel'] } },
  }, null, 2))
  // A profile patch must be a top-level YAML array; empty array = no overrides.
  await writeFile(path.join(profile, 'cordis.patch.yml'), '[]\n')
  await symlink(packageRoot, path.join(profile, 'node_modules', 'dsh-plugin-lightnovel'), 'dir')
  await symlink(
    path.join(packageRoot, 'node_modules', '@deepseek-ai', 'dsh-base'),
    path.join(profile, 'node_modules', '@deepseek-ai', 'dsh-base'),
    'dir',
  )

  const { stdout } = await execFileAsync(process.execPath, [cli, '--profile', 'lntest', '--dump-config'], {
    env: { ...process.env, DSH_HOME: home },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 60_000,
  })
  dump = stdout
}, 90_000)

afterAll(async () => { await rm(home, { recursive: true, force: true }) })

describe('dsh CLI bundle composition (requirement #12)', () => {
  it('emits a composed profile tree containing the dsh-base layer', () => {
    expect(dump).toContain('# == @deepseek-ai/dsh-base')
    expect(dump.length).toBeGreaterThan(1000)
  })

  it('inserts the lightnovel plugin row from cordis.patch.yml', () => {
    expect(dump).toContain('# == dsh-plugin-lightnovel')
    expect(dump).toContain('- id: lightnovel')
    expect(dump).toContain('name: dsh-plugin-lightnovel')
  })

  it('composes every documented config field', () => {
    for (const field of [
      'dataDir', 'libraryDir', 'dartBinary', 'dartProjectDir', 'fixturesDir',
      'enabledSources', 'requestIntervalMs', 'maxConcurrentDownloads',
      'maxRetries', 'respectRobots', 'offlineOnly', 'logLevel',
    ]) {
      expect(dump, `missing config field ${field}`).toContain(`${field}:`)
    }
  })

  it('bundle manifest points at the shipped patch and prebuilt entry', async () => {
    const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
    expect(pkg.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(pkg.main).toBe('dist/index.js')
    expect(pkg.files).toContain('dist')
    expect(pkg.files).toContain('vendor/bili_novel_packer')
    expect(pkg.files).toContain('test/fixtures')
  })
})

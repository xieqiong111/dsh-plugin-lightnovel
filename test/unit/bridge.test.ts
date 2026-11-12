import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawn: spawnMock }
})

import { spawn } from 'node:child_process'
import { DartBridge } from '../../src/core/bridge.js'
import { Config, resolveConfig } from '../../src/config.js'
import { createLogger } from '../../src/util/logger.js'

afterEach(() => {
  spawnMock.mockReset()
  vi.unstubAllEnvs()
})

/** Minimal child process that emits exactly one NDJSON result line. */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    killed: boolean
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = vi.fn(() => { child.killed = true; return true })
  setTimeout(() => {
    child.stdout.write('{"type":"result","ok":true,"data":{"novel":{"id":"1"}}}\n')
  }, 0)
  return child
}

describe('DartBridge spawn environment (regression: live scrape as non-root)', () => {
  it('runs AOT binaries from a writable cwd and pins the upstream log to an absolute path', async () => {
    vi.stubEnv('LN_DART_BINARY', undefined)
    const config = resolveConfig(Config({
      dartBinary: '/fake/bnp_headless',
      dataDir: '/tmp/ln-bridge-test/data',
      dartProjectDir: '/tmp/ln-bridge-test/vendor/bili_novel_packer',
    }), '/pkg', '/home/test')
    const bridge = new DartBridge(config, createLogger('/tmp/ln-test-logs'))
    spawnMock.mockImplementation(() => fakeChild())

    const result = await bridge.run({ command: 'details', url: 'https://www.bilinovel.net/novel/2059.html', sourceId: 'bilinovel', allowedSources: ['bilinovel'] })
    expect(result.data).toEqual({ novel: { id: '1' } })
    expect(spawnMock).toHaveBeenCalledTimes(1)

    const options = vi.mocked(spawn).mock.calls[0]![2]!
    // AOT binaries must not inherit the read-only vendor tree as cwd, or the
    // upstream `File('bili_novel.log')` throws EACCES on the first live request.
    expect(options.cwd).toBe(config.dataDir)
    expect(options.cwd).not.toBe(config.dartProjectDir)
    expect(options.env?.BNP_LOG_FILE).toBe(path.join(config.logsDir, 'bili_novel.log'))
    expect(options.env?.BNP_LOG_FILE?.startsWith('/')).toBe(true)
    expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe'])
  })

  it('keeps the project root as cwd for the `dart run` fallback', async () => {
    vi.stubEnv('LN_DART_BINARY', undefined)
    // Isolated project with a headless entry but NO compiled AOT binary, so
    // resolveRunner() is forced down the `dart run` path.
    const projectDir = await mkdtemp(path.join(tmpdir(), 'ln-bridge-project-'))
    await mkdir(path.join(projectDir, 'bin'), { recursive: true })
    await writeFile(path.join(projectDir, 'bin', 'headless.dart'), '// test entry\n')
    const config = resolveConfig(Config({
      dartBinary: '',
      dataDir: '/tmp/ln-bridge-test/data2',
      dartProjectDir: projectDir,
    }), '/pkg', '/home/test')
    const bridge = new DartBridge(config, createLogger('/tmp/ln-test-logs'))
    spawnMock.mockImplementation(() => fakeChild())

    await bridge.run({ command: 'details', url: 'https://www.bilinovel.net/novel/2059.html', sourceId: 'bilinovel', allowedSources: ['bilinovel'] })
    const options = vi.mocked(spawn).mock.calls[0]![2]!
    expect(options.cwd).toBe(projectDir)
    expect(options.env?.BNP_LOG_FILE).toBe(path.join(config.logsDir, 'bili_novel.log'))
  })
})

import { spawn } from 'node:child_process'
import { access, constants, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedConfig } from '../config.js'
import type { BridgeEvent } from '../types.js'
import type { Logger } from '../util/logger.js'

export type DartCommand = 'details' | 'volumes' | 'pack'

export interface DartRequest {
  command: DartCommand
  url: string
  sourceId: string
  allowedSources: string[]
  volumes?: string
  outputDir?: string
  combine?: boolean
  addChapterTitle?: boolean
  /** Written by the caller to request cooperative cancellation. */
  cancelFile?: string
  timeoutMs?: number
  signal?: AbortSignal
  onProgress?: (event: BridgeEvent) => void
}

export interface DartResult<T = Record<string, unknown>> {
  data: T
  events: BridgeEvent[]
}

export class DartError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) {
    super(message)
    this.name = 'DartError'
  }
}

interface Runner {
  command: string
  prefix: string[]
  label: string
}

/** Spawns the *original* Dart core through its new headless entry point. */
export class DartBridge {
  constructor(private readonly config: ResolvedConfig, private readonly logger: Logger) {}

  async probe(): Promise<{ available: boolean; runner: string | null; reason?: string }> {
    const runner = await this.resolveRunner()
    if (!runner) {
      return {
        available: false,
        runner: null,
        reason: 'No Dart executable found. Set LN_DART_BINARY (compiled bnp_headless) or install Dart 3.11+ and set LN_DART_PROJECT_DIR.',
      }
    }
    return { available: true, runner: runner.label }
  }

  private async resolveRunner(): Promise<Runner | null> {
    const explicit = this.config.dartBinary || process.env.LN_DART_BINARY
    if (explicit) return { command: explicit, prefix: [], label: explicit }
    const localBuild = path.join(this.config.dartProjectDir, 'build', 'bnp_headless')
    for (const candidate of ['/opt/bnp/bnp_headless', localBuild]) {
      if (await existsExecutable(candidate)) return { command: candidate, prefix: [], label: candidate }
    }
    const headlessScript = path.join(this.config.dartProjectDir, 'bin', 'headless.dart')
    if (!(await exists(headlessScript))) return null
    const dartSdk = process.env.LN_DART_SDK
    const dart = dartSdk ? path.join(dartSdk, 'bin', 'dart') : 'dart'
    return {
      command: dart,
      prefix: ['run', headlessScript],
      label: `${dart} run ${headlessScript}`,
    }
  }

  async run<T = Record<string, unknown>>(request: DartRequest): Promise<DartResult<T>> {
    const runner = await this.resolveRunner()
    if (!runner) {
      throw new DartError('DART_UNAVAILABLE', (await this.probe()).reason ?? 'Dart core unavailable', true)
    }
    if (request.outputDir) await mkdir(request.outputDir, { recursive: true })

    const args = [...runner.prefix, request.command,
      '--source', request.sourceId,
      '--url', request.url,
      '--fixtures', this.config.fixturesDir,
      '--allowed-sources', request.allowedSources.join(','),
    ]
    if (!this.config.allowNonPublicSources) args.push('--require-public-sources', 'true')
    if (request.command === 'pack') {
      args.push(
        '--output-dir', request.outputDir ?? path.join(this.config.tasksDir, 'scratch'),
        '--volumes', request.volumes ?? 'all',
        '--combine', String(request.combine ?? false),
        '--add-chapter-title', String(request.addChapterTitle ?? false),
      )
      if (request.cancelFile) args.push('--cancel-file', request.cancelFile)
    }

    const timeout = request.timeoutMs ?? this.config.taskTimeoutMs
    this.logger.info('bridge', 'spawn', { runner: runner.label, command: request.command, sourceId: request.sourceId, args: args.slice(-8) })

    return new Promise<DartResult<T>>((resolve, reject) => {
      const child = spawn(runner.command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        cwd: this.config.dartProjectDir,
      })
      const events: BridgeEvent[] = []
      let stdoutBuffer = ''
      let stderrBuffer = ''
      let settled = false
      let killTimer: NodeJS.Timeout | null = null

      const cleanup = (): void => {
        if (killTimer) clearTimeout(killTimer)
        killTimer = null
        request.signal?.removeEventListener('abort', onAbort)
        clearTimeout(timeoutTimer)
      }
      const finish = (error: Error | null, data?: T): void => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve({ data: data as T, events })
      }
      const cancelGracefully = async (): Promise<void> => {
        if (request.cancelFile) {
          await writeFile(request.cancelFile, 'cancel\n', 'utf8').catch(() => undefined)
        }
        if (!child.killed) child.kill('SIGTERM')
        if (!killTimer) {
          killTimer = setTimeout(() => { if (!child.killed) child.kill('SIGKILL') }, 3000)
          killTimer.unref?.()
        }
      }
      const onAbort = (): void => { void cancelGracefully() }
      request.signal?.addEventListener('abort', onAbort, { once: true })

      const timeoutTimer = setTimeout(() => {
        void cancelGracefully()
        finish(new DartError('TIMEOUT', `Dart ${request.command} exceeded ${timeout}ms`, true))
      }, timeout)
      timeoutTimer.unref?.()

      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        stdoutBuffer += chunk
        let newline = stdoutBuffer.indexOf('\n')
        while (newline >= 0) {
          const line = stdoutBuffer.slice(0, newline).trim()
          stdoutBuffer = stdoutBuffer.slice(newline + 1)
          if (line) handleLine(line)
          newline = stdoutBuffer.indexOf('\n')
        }
      })
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        stderrBuffer = (stderrBuffer + chunk).slice(-8000)
      })
      child.on('error', (error) => {
        finish(new DartError('SPAWN_FAILED', `${runner.label}: ${error.message}`, true))
      })
      child.on('close', (code) => {
        if (stdoutBuffer.trim()) handleLine(stdoutBuffer.trim())
        if (settled) return
        if (stderrBuffer.trim()) this.logger.debug('bridge', 'stderr', { tail: stderrBuffer.slice(-2000) })
        finish(new DartError('DART_EXIT', `Dart ${request.command} exited with code ${code ?? 'unknown'} without a result line. ${stderrBuffer.slice(-400)}`, true))
      })

      function handleLine(line: string): void {
        let event: BridgeEvent
        try {
          event = JSON.parse(line) as BridgeEvent
        } catch {
          // Upstream code may occasionally print non-JSON to stdout; log, don't crash.
          return
        }
        events.push(event)
        if (event.type === 'progress') request.onProgress?.(event)
        if (event.type === 'result') finish(null, (event.data ?? {}) as T)
        if (event.type === 'error') {
          const code = event.code ?? 'PACK_FAILED'
          finish(new DartError(code, event.message ?? code, code === 'PACK_FAILED' || code === 'TIMEOUT'))
        }
      }
    })
  }
}

async function exists(file: string): Promise<boolean> {
  try { await access(file, constants.F_OK); return true } catch { return false }
}

async function existsExecutable(file: string): Promise<boolean> {
  try { await access(file, constants.X_OK); return true } catch { return false }
}

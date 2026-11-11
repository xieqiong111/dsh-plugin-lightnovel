import { appendFile, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LogEntry {
  ts: string
  level: LogLevel
  scope: string
  event: string
  message?: string
  [key: string]: unknown
}

export interface Logger {
  debug(scope: string, event: string, fields?: Record<string, unknown>): void
  info(scope: string, event: string, fields?: Record<string, unknown>): void
  warn(scope: string, event: string, fields?: Record<string, unknown>): void
  error(scope: string, event: string, fields?: Record<string, unknown>): void
  child(defaultScope: string): Logger
  recent(limit?: number): LogEntry[]
  flush(): Promise<void>
  close(): Promise<void>
}

/** Structured JSON-lines logger with an in-memory ring buffer and daily files. */
export function createLogger(logsDir: string, level: LogLevel = 'info', echo = false): Logger {
  const ring: LogEntry[] = []
  const pending: string[] = []
  let timer: NodeJS.Timeout | null = null
  let closed = false
  let currentDay = ''

  const filePath = (): string => path.join(logsDir, `plugin-${new Date().toISOString().slice(0, 10)}.log`)

  const schedule = (): void => {
    if (timer || closed) return
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, 250)
    timer.unref?.()
  }

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return
    const batch = pending.splice(0, pending.length).join('\n') + '\n'
    try {
      await mkdir(logsDir, { recursive: true })
      await appendFile(filePath(), batch, 'utf8')
    } catch (error) {
      if (echo) console.error('[lightnovel] log write failed:', error)
    }
  }

  const write = (lvl: LogLevel, scope: string, event: string, fields?: Record<string, unknown>): void => {
    if (LEVELS[lvl] < LEVELS[level]) return
    const entry: LogEntry = { ts: new Date().toISOString(), level: lvl, scope, event, ...redact(fields ?? {}) }
    ring.push(entry)
    if (ring.length > 500) ring.shift()
    pending.push(JSON.stringify(entry))
    if (echo) {
      const line = `[lightnovel:${scope}] ${event} ${JSON.stringify(entry)}`
      if (lvl === 'error') console.error(line)
      else if (lvl === 'warn') console.warn(line)
      else console.log(line)
    }
    const day = entry.ts.slice(0, 10)
    if (currentDay && currentDay !== day) void rotate()
    currentDay = day
    schedule()
  }

  const rotate = async (): Promise<void> => {
    try {
      const files = (await readdir(logsDir)).filter((f) => /^plugin-\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort()
      for (const file of files.slice(0, Math.max(0, files.length - 14))) {
        await rm(path.join(logsDir, file), { force: true })
      }
    } catch { /* best effort */ }
  }

  const base: Logger = {
    debug: (scope, event, fields) => write('debug', scope, event, fields),
    info: (scope, event, fields) => write('info', scope, event, fields),
    warn: (scope, event, fields) => write('warn', scope, event, fields),
    error: (scope, event, fields) => write('error', scope, event, fields),
    child: (defaultScope) => ({
      debug: (_s, event, fields) => write('debug', defaultScope, event, fields),
      info: (_s, event, fields) => write('info', defaultScope, event, fields),
      warn: (_s, event, fields) => write('warn', defaultScope, event, fields),
      error: (_s, event, fields) => write('error', defaultScope, event, fields),
      child: () => base.child(defaultScope),
      recent: base.recent,
      flush,
      close: base.close,
    }),
    recent: (limit = 50) => ring.slice(-limit),
    flush,
    close: async () => {
      if (timer) clearTimeout(timer)
      timer = null
      await flush()
      closed = true
    },
  }
  return base
}

/** Never persist secrets or full query strings with tokens. */
function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (/(apikey|token|secret|password|cookie|authorization)/i.test(key)) {
      out[key] = '[redacted]'
    } else if (typeof value === 'string' && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`
    } else {
      out[key] = value
    }
  }
  return out
}

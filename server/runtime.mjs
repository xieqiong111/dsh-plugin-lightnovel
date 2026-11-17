/**
 * BFF runtime bootstrap.
 *
 * The web console talks to this process, which owns exactly one PluginRuntime
 * (the same object the six Cordis tools use). No LLM, no DSH CLI and no second
 * copy of the business logic is involved.
 */
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../dist/config.js'
import { PluginRuntime } from '../dist/runtime.js'
import { createLogger } from '../dist/util/logger.js'
import { readSuwayomiConfig } from './suwayomi-client.mjs'
import { readKomgaConfig } from './komga-client.mjs'

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const asBool = (value, fallback) =>
  value === undefined || value === null || value === ''
    ? fallback
    : /^(1|true|yes|on)$/i.test(String(value))

const asInt = (value, fallback, min, max) => {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback
}

const asList = (value, fallback) => {
  const list = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return list.length > 0 ? list : fallback
}

/** All host-specific values come from the environment; nothing is hard-coded. */
export function readSettings(env = process.env) {
  const dataDir =
    env.LN_BFF_DATA_DIR ||
    env.LN_DATA_DIR ||
    path.join(os.homedir(), '.local', 'share', 'dsh-plugin-lightnovel-web')
  // A dedicated BFF data dir must also own its library: never inherit the
  // operator's LN_LIBRARY_DIR when the caller asked for an isolated data dir.
  const libraryDir =
    env.LN_BFF_LIBRARY_DIR ||
    (env.LN_BFF_DATA_DIR ? path.join(dataDir, 'library') : env.LN_LIBRARY_DIR || '')

  const config = {
    dataDir,
    libraryDir,
    dartBinary: '',
    dartProjectDir: '',
    fixturesDir: env.LN_FIXTURES_DIR || '',
    enabledSources: asList(env.LN_ENABLED_SOURCES, ['bilinovel', 'fixture']),
    searchTimeoutMs: asInt(env.LN_SEARCH_TIMEOUT_MS, 15000, 1000, 120000),
    requestIntervalMs: asInt(env.LN_REQUEST_INTERVAL_MS, 4000, 0, 60000),
    taskTimeoutMs: asInt(env.LN_TASK_TIMEOUT_MS, 3600000, 1000, 86400000),
    maxConcurrentDownloads: asInt(env.LN_MAX_CONCURRENT_DOWNLOADS, 1, 1, 8),
    maxRetries: asInt(env.LN_MAX_RETRIES, 2, 0, 10),
    respectRobots: asBool(env.LN_RESPECT_ROBOTS, true),
    offlineOnly: asBool(env.LN_OFFLINE_ONLY, false),
    // The web console must never enable login/paywall sources. There is no
    // config switch for this on purpose.
    allowNonPublicSources: false,
    searchMode: ['live', 'local', 'hybrid'].includes(env.LN_SEARCH_MODE)
      ? env.LN_SEARCH_MODE
      : 'hybrid',
    userAgent: env.LN_USER_AGENT || 'dsh-plugin-lightnovel/1.0 (+polite crawler; 1 request / 4s)',
    maxVolumesPerTask: asInt(env.LN_MAX_VOLUMES_PER_TASK, 50, 1, 200),
    logLevel: ['debug', 'info', 'warn', 'error'].includes(env.LN_LOG_LEVEL) ? env.LN_LOG_LEVEL : 'info',
    extraTraditionalMap: env.LN_EXTRA_TRADITIONAL_MAP || '',
  }

  const suwayomi = readSuwayomiConfig(env)
  const komga = readKomgaConfig(env)
  return {
    mangaCredentialsConfigured: Boolean(suwayomi.username || suwayomi.password),
    komgaCredentialsConfigured: Boolean(komga.apiKey || komga.username || komga.password),
    host: env.LN_BFF_HOST || '127.0.0.1',
    port: asInt(env.LN_BFF_PORT, 5273, 1, 65535),
    webDist: env.LN_WEB_DIST || path.join(packageRoot, 'web', 'dist'),
    token: env.LN_BFF_TOKEN || '',
    corsOrigin: env.LN_BFF_CORS_ORIGIN || '',
    allowDelete: asBool(env.LN_BFF_ALLOW_DELETE, false),
    echoLogs: asBool(env.LN_LOG_ECHO, false),
    config,
  }
}

/** Build and fully initialise one runtime (index, library, task recovery, Dart probe). */
export async function boot(settings) {
  const resolved = resolveConfig(settings.config, packageRoot, os.homedir())
  const logger = createLogger(resolved.logsDir, resolved.logLevel, settings.echoLogs)
  const runtime = new PluginRuntime(resolved, logger)
  await runtime.init()
  return { runtime, logger, resolved }
}

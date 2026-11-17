#!/usr/bin/env node
/**
 * Novel & Manga Studio web console server.
 *
 *   node server/serve.mjs
 *
 * One process serves the built React app AND the /api/* endpoints. The API is a
 * thin adapter over PluginRuntime: no LLM, no DSH CLI, no duplicate business
 * logic. Zero runtime dependencies beyond the plugin's own dist/ + node_modules.
 *
 * Environment (all optional):
 *   LN_BFF_HOST=127.0.0.1        listen address (use 0.0.0.0 in Docker)
 *   LN_BFF_PORT=5273             listen port
 *   LN_WEB_DIST=<dir>            built frontend (default <repo>/web/dist)
 *   LN_BFF_TOKEN=<secret>        require X-LN-Token on every /api request
 *   LN_BFF_CORS_ORIGIN=<origin>  enable CORS for split-origin dev setups
 *   LN_BFF_DATA_DIR=<dir>        isolated data/library/logs/tasks root
 *   LN_BFF_LIBRARY_DIR=<dir>     override EPUB library root
 *   LN_BFF_ALLOW_DELETE=false    opt in to DELETE /api/library/:id
 *   LN_OFFLINE_ONLY=true         only the offline fixture source
 *   LN_ENABLED_SOURCES=...       comma separated source ids
 *   LN_DART_BINARY / LN_DART_SDK / LN_DART_PROJECT_DIR  Dart headless runner
 *   LN_FIXTURES_DIR=<dir>        offline fixture root
 *   SUWAYOMI_URL=<origin>        independent manga backend (optional)
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { createApi } from './api.mjs'
import { createSuwayomiClient } from './suwayomi-client.mjs'
import { boot, readSettings } from './runtime.mjs'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.epub': 'application/epub+zip',
}

const FALLBACK_PAGE = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>Novel &amp; Manga Studio</title>
<body style="font:14px/1.8 system-ui,sans-serif;max-width:680px;margin:64px auto;color:#33344B">
<h1>前端产物尚未构建</h1>
<p>API 服务已就绪，但没有找到 <code>web/dist/index.html</code>。</p>
<pre style="background:#F7F7FC;padding:16px;border-radius:12px">cd web
npm ci
VITE_API_MODE=live npm run build
cd ..
node server/serve.mjs</pre>
<p>也可以设置 <code>LN_WEB_DIST</code> 指向已有的构建产物。</p>
</body></html>`

function sendText(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

async function serveStatic(req, res, url, webDist) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed', 'text/plain; charset=utf-8')
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    sendText(res, 400, 'Bad path', 'text/plain; charset=utf-8')
    return
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.includes('..')) {
    sendText(res, 400, 'Bad path', 'text/plain; charset=utf-8')
    return
  }
  const root = path.resolve(webDist)
  const requested = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  if (requested !== root && !requested.startsWith(root + path.sep)) {
    sendText(res, 403, 'Forbidden', 'text/plain; charset=utf-8')
    return
  }
  let file = requested
  let info = await stat(file).catch(() => null)
  if (!info || !info.isFile()) {
    if (path.extname(pathname)) {
      sendText(res, 404, 'Not found', 'text/plain; charset=utf-8')
      return
    }
    file = path.join(root, 'index.html')
    info = await stat(file).catch(() => null)
  }
  if (!info || !info.isFile()) {
    sendText(res, 200, FALLBACK_PAGE)
    return
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'same-origin',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file).on('error', () => res.destroy()).pipe(res)
}

const settings = readSettings()
const { runtime, logger } = await boot(settings)
const mangaClient = runtime.suwayomi ?? createSuwayomiClient()
const handleApi = createApi(runtime, settings, logger, mangaClient)

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  if (settings.corsOrigin) {
    res.setHeader('access-control-allow-origin', settings.corsOrigin)
    res.setHeader('access-control-allow-headers', 'content-type, x-ln-token, authorization')
    res.setHeader('access-control-allow-methods', 'GET, HEAD, POST, DELETE, OPTIONS')
    res.setHeader('vary', 'Origin')
  }
  if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    res.writeHead(204)
    res.end()
    return
  }
  void handleApi(req, res, url).then((handled) => {
    if (!handled) return serveStatic(req, res, url, settings.webDist)
  }).catch((error) => {
    logger.error('webapi', 'unhandled', { error: String(error) })
    if (!res.headersSent) sendText(res, 500, 'Internal error', 'text/plain; charset=utf-8')
    else res.destroy()
  })
})

server.on('clientError', (_error, socket) => socket.destroy())
server.listen(settings.port, settings.host, () => {
  logger.info('webapi', 'listening', {
    host: settings.host,
    port: settings.port,
    dart: runtime.dartAvailable,
    sources: runtime.registry.describe().map((s) => s.id),
    tokenProtected: Boolean(settings.token),
  })
  console.log(`[lightnovel-web] http://${settings.host}:${settings.port}/  dart=${runtime.dartAvailable ? 'ready' : 'unavailable'}`)
})

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('webapi', 'shutdown', { signal })
  server.close()
  await runtime.dispose()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

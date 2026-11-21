import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { atomicWriteJson } from '../dist/util/json.js'
import { createKomgaClient, normalizeKomgaUrl, readKomgaConfig } from './komga-client.mjs'

const settingsPath = '/api/settings/integrations'
const digest = (value) => createHash('sha256').update(value).digest('hex')

export function isDshReadRoute(method, pathname) {
  return method === 'GET' && (
    ['/api/health', '/api/library', '/api/library/stats', '/api/tasks',
      '/api/komga/status', '/api/komga/libraries', '/api/komga/series',
      '/api/manga/downloads', '/api/manga/library', '/api/manga/sources', '/api/manga/health'].includes(pathname)
    || /^\/api\/manga\/[1-9]\d{0,9}\/komga$/.test(pathname)
  )
}

export async function loadIntegrations(settings) {
  if (!settings.auth) return undefined
  const file = path.join(settings.config.dataDir, 'auth', 'integrations.json')
  let saved = {}
  try {
    saved = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const environment = settings.komgaConfig ?? readKomgaConfig()
  const allowed = new Set()
  for (const entry of [environment.url, ...(settings.komgaAllowedUrls ?? [])]) {
    if (!entry) continue
    try { allowed.add(normalizeKomgaUrl(entry)) } catch { /* Ignore an invalid deployment URL. */ }
  }
  const makeClient = (entry) => createKomgaClient({
    ...environment, ...entry, ...(entry ? { username: '', password: '' } : {}),
  })
  const selected = saved.komga && allowed.has(saved.komga.url) ? saved.komga : null
  if (!selected) delete saved.komga
  let client = makeClient(selected ?? undefined)
  let pending = Promise.resolve()
  const update = (action) => {
    const next = pending.then(action)
    pending = next.catch(() => undefined)
    return next
  }
  const status = () => ({
    komga: {
      url: saved.komga?.url || environment.url || [...allowed][0] || '',
      allowedUrls: [...allowed],
      hasKey: Boolean(saved.komga?.apiKey || environment.apiKey),
    },
    dsh: { active: Boolean(saved.dsh?.digest), createdAt: saved.dsh?.createdAt ?? null },
  })

  return {
    get client() { return client },
    authorizeDsh(req) {
      const key = /^Bearer (studio_dsh_[A-Za-z0-9_-]{43})$/i.exec(String(req.headers.authorization ?? ''))?.[1]
      return Boolean(key && /^[a-f0-9]{64}$/.test(saved.dsh?.digest ?? '')
        && timingSafeEqual(Buffer.from(digest(key), 'hex'), Buffer.from(saved.dsh.digest, 'hex')))
    },
    async handle(req, res, url, { sendJson, sendError, readBody }) {
      if (url.pathname !== settingsPath) return false
      if (!settings.auth.sessionAllowed(req)) {
        sendError(res, 403, 'ADMIN_SESSION_REQUIRED', '请通过浏览器管理员会话管理集成密钥。')
        return true
      }
      if (req.method === 'GET') {
        sendJson(res, 200, status())
        return true
      }
      if (req.method !== 'POST') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', '请求方法不支持。')
        return true
      }
      if (String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
        sendError(res, 415, 'JSON_REQUIRED', '请使用 JSON 提交。')
        return true
      }
      try {
        const { action, url: address, apiKey } = await readBody(req)
        if (action === 'save-komga') {
          let target
          try { target = normalizeKomgaUrl(address) } catch { /* invalid URL */ }
          if (!target || !allowed.has(target)) {
            sendError(res, 400, 'KOMGA_URL_NOT_ALLOWED', '请选择部署时允许的 Komga 地址。')
            return true
          }
          if (typeof apiKey !== 'string' || apiKey.length < 1 || apiKey.length > 512 || !/^[\x21-\x7e]+$/.test(apiKey)) {
            sendError(res, 400, 'INVALID_KOMGA_KEY', '请输入有效的 Komga API Key。')
            return true
          }
          const entry = { url: target, apiKey }
          const tested = makeClient(entry)
          try { await tested.libraries() } catch (error) {
            const message = error.code === 'UPSTREAM_AUTH' || error.status === 401 || error.status === 403
              ? 'Komga 拒绝了这个 API Key。' : 'Komga 连接验证未通过，请检查地址、网络和 API Key。'
            sendError(res, 502, 'KOMGA_TEST_FAILED', message)
            return true
          }
          await update(async () => {
            const next = { ...saved, komga: entry }
            await atomicWriteJson(file, next)
            saved = next
            client = tested
          })
          sendJson(res, 200, status())
        } else if (action === 'rotate-dsh' || action === 'revoke-dsh') {
          const token = action === 'rotate-dsh' ? 'studio_dsh_' + randomBytes(32).toString('base64url') : null
          await update(async () => {
            const next = { ...saved, dsh: token ? { digest: digest(token), createdAt: new Date().toISOString() } : null }
            await atomicWriteJson(file, next)
            saved = next
          })
          sendJson(res, 200, { ...status(), ...(token ? { token } : {}) })
        } else {
          sendError(res, 400, 'INVALID_ACTION', '未知的集成设置操作。')
        }
      } catch (error) {
        if (typeof error.status === 'number' && error.status < 500) sendError(res, error.status, error.code, error.message)
        else sendError(res, 503, 'SETTINGS_UNAVAILABLE', '集成设置暂时无法保存。')
      }
      return true
    },
  }
}

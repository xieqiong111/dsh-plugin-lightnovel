import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdirSync, closeSync, openSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { promisify } from 'node:util'

const derive = promisify(scrypt)
const hour = 3600
const durations = [8 * hour, 24 * hour, 7 * 24 * hour, 30 * 24 * hour]
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const equal = (a, b) => timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'))

class AuthError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  if (String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AuthError(415, 'JSON_REQUIRED', '请使用 JSON 提交。')
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 4096) throw new AuthError(413, 'BODY_TOO_LARGE', '提交内容过大。')
    chunks.push(chunk)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
  } catch { /* malformed JSON */ }
  throw new AuthError(400, 'INVALID_JSON', '提交的 JSON 无效。')
}

function crossOrigin(req, origin) {
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'none' && site !== 'same-origin') return true
  const supplied = req.headers.origin
  if (!supplied) return false
  if (origin) return supplied !== origin
  try {
    const url = new URL(supplied)
    return !['http:', 'https:'].includes(url.protocol) || url.host !== req.headers.host
  } catch {
    return true
  }
}

export function openStudioAuth(settings, now = Date.now) {
  const dir = path.join(settings.config.dataDir, 'auth')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const database = path.join(dir, 'studio.sqlite')
  // Create with private permissions before opening SQLite, including on first boot.
  closeSync(openSync(database, 'a', 0o600))
  const db = new DatabaseSync(database)
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY CHECK (id = 1), username TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session (
      digest TEXT PRIMARY KEY, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1), namespace TEXT NOT NULL, setup TEXT NOT NULL
    );
  `)
  db.prepare('INSERT OR IGNORE INTO settings VALUES (1, ?, ?)').run(randomBytes(8).toString('hex'), randomBytes(20).toString('base64url'))
  const { namespace, setup } = db.prepare('SELECT namespace, setup FROM settings WHERE id = 1').get()
  const account = db.prepare('SELECT username, salt, hash FROM admin WHERE id = 1')
  const cookieName = 'studio_session_' + namespace
  const setupCode = settings.setupCode || setup
  if (!account.get() && !settings.setupCode) {
    writeFileSync(path.join(dir, 'setup-code'), setup + '\n', { mode: 0o600 })
  }
  const cookieFlags = 'Path=/api; HttpOnly; SameSite=Strict' + (settings.secureCookie ? '; Secure' : '')
  const attempts = new Map()
  let verifying = 0
  const dummySalt = randomBytes(16).toString('hex')

  function rateLimit(req) {
    const nowMs = now()
    const ip = req.socket.remoteAddress ?? 'unknown'
    let record = attempts.get(ip)
    if (!record || record.until <= nowMs) {
      if (attempts.size >= 512) {
        for (const [key, item] of attempts) if (item.until <= nowMs) attempts.delete(key)
      }
      if (attempts.size >= 512) throw new AuthError(429, 'RATE_LIMITED', '请求过多，请稍后再试。')
      record = { until: nowMs + 60_000, count: 0 }
      attempts.set(ip, record)
    }
    if (++record.count > 8 || verifying >= 4) throw new AuthError(429, 'RATE_LIMITED', '请求过多，请稍后再试。')
  }

  function sessionDigest(req) {
    for (const part of String(req.headers.cookie ?? '').split(';')) {
      const value = part.trim()
      if (value.startsWith(cookieName + '=')) {
        const token = value.slice(cookieName.length + 1)
        if (/^[A-Za-z0-9_-]{43}$/.test(token)) return sha256(token)
      }
    }
    return ''
  }

  function session(req) {
    const digest = sessionDigest(req)
    if (!digest) return null
    return db.prepare('SELECT expires FROM session WHERE digest = ? AND expires > ?').get(digest, now()) ?? null
  }

  function status(req) {
    const admin = account.get()
    const active = session(req)
    return { enabled: true, needsSetup: !admin, username: active ? admin.username : null,
      expiresAt: active ? active.expires : null, durations }
  }

  function beginSession(req, res, seconds) {
    const expires = now() + seconds * 1000
    const token = randomBytes(32).toString('base64url')
    db.prepare('DELETE FROM session WHERE expires <= ? OR digest = ?').run(now(), sessionDigest(req))
    db.prepare('INSERT INTO session VALUES (?, ?)').run(sha256(token), expires)
    res.setHeader('set-cookie', `${cookieName}=${token}; ${cookieFlags}; Max-Age=${seconds}`)
    return expires
  }

  return {
    close: () => db.close(),
    sessionAllowed(req) {
      return !crossOrigin(req, settings.webOrigin) && Boolean(session(req))
    },
    async handle(req, res, url) {
      if (!url.pathname.startsWith('/api/auth/')) return false
      try {
        if (crossOrigin(req, settings.webOrigin)) throw new AuthError(403, 'CROSS_ORIGIN', '请从 Studio 页面操作。')
        if (req.method === 'GET' && url.pathname === '/api/auth/status') {
          reply(res, 200, status(req))
          return true
        }
        if (req.method !== 'POST') throw new AuthError(405, 'METHOD_NOT_ALLOWED', '此操作需要 POST。')
        if (url.pathname === '/api/auth/logout') {
          db.prepare('DELETE FROM session WHERE digest = ?').run(sessionDigest(req))
          res.setHeader('set-cookie', `${cookieName}=; ${cookieFlags}; Max-Age=0`)
          reply(res, 200, { ok: true })
          return true
        }

        const creating = url.pathname === '/api/auth/setup'
        if (!creating && url.pathname !== '/api/auth/login') throw new AuthError(404, 'NOT_FOUND', '接口不存在。')
        rateLimit(req)
        const body = await readJson(req)
        const username = typeof body.username === 'string' ? body.username.trim() : ''
        const password = typeof body.password === 'string' ? body.password : ''
        const seconds = body.seconds ?? durations[0]
        if (!durations.includes(seconds)) throw new AuthError(400, 'INVALID_DURATION', '请选择有效的免登录时长。')
        if (!username || username.length > 40 || !password || Buffer.byteLength(password) > 256) {
          throw new AuthError(400, 'INVALID_CREDENTIALS', '请输入有效的账号和密码。')
        }

        const admin = account.get()
        if (creating) {
          if (admin) throw new AuthError(409, 'ALREADY_CONFIGURED', '管理员账号已创建，请登录。')
          if (typeof body.setupCode !== 'string' || !equal(body.setupCode.trim(), setupCode)) {
            throw new AuthError(403, 'INVALID_SETUP_CODE', '初始化码不正确。')
          }
          if (Array.from(password).length < 10) throw new AuthError(400, 'WEAK_PASSWORD', '密码至少需要 10 个字符。')
        }

        const salt = creating ? randomBytes(16).toString('hex') : admin?.salt ?? dummySalt
        if (verifying >= 4) throw new AuthError(429, 'RATE_LIMITED', '请求过多，请稍后再试。')
        verifying++
        let digest
        try {
          digest = (await derive(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 })).toString('hex')
        } finally {
          verifying--
        }

        if (creating) {
          const inserted = db.prepare('INSERT OR IGNORE INTO admin VALUES (1, ?, ?, ?)').run(username, salt, digest)
          if (!inserted.changes) throw new AuthError(409, 'ALREADY_CONFIGURED', '管理员账号已创建，请登录。')
        } else if (!admin || !equal(digest, admin.hash) || !equal(username, admin.username)) {
          throw new AuthError(401, 'LOGIN_FAILED', '账号或密码不正确。')
        }

        const expiresAt = beginSession(req, res, seconds)
        reply(res, 200, { enabled: true, needsSetup: false, username, expiresAt, durations })
      } catch (error) {
        if (!(error instanceof AuthError)) throw error
        if (error.status === 429) res.setHeader('retry-after', '60')
        reply(res, error.status, { error: { code: error.code, message: error.message } })
      }
      return true
    },
  }
}

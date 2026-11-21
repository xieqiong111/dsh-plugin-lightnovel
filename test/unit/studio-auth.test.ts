import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { openStudioAuth } from '../../server/auth.mjs'
import { createApi } from '../../server/api.mjs'

it('protects initial setup, persists sessions, enforces expiry and revokes logout', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'studio-auth-'))
  const settings = { config: { dataDir }, token: '', secureCookie: true }
  let now = 0
  let auth = openStudioAuth(settings, () => now)
  const handle = () => createApi({ dartAvailable: true }, { ...settings, auth }, { warn() {} })
  let api = handle()
  async function send(method: string, target: string, body?: object, cookie = '', origin?: string) {
    const headers = new Headers()
    let status = 0
    let payload = ''
    const req = {
      method, socket: { remoteAddress: '127.0.0.1' },
      headers: { host: 'localhost', 'content-type': 'application/json', cookie, origin },
      async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)) },
    }
    const res = {
      setHeader(name: string, value: string) { headers.set(name, value) },
      writeHead(code: number) { status = code },
      end(value: string) { payload = value },
    }
    await api(req, res, new URL('/api' + target, 'http://localhost'))
    return new Response(payload, { status, headers })
  }

  try {
    const get = (target: string, cookie = '', origin?: string) => send('GET', target, undefined, cookie, origin)
    const post = (target: string, body: object, cookie = '', origin?: string) => send('POST', target, body, cookie, origin)
    const setupCode = (await readFile(path.join(dataDir, 'auth', 'setup-code'), 'utf8')).trim()
    const credentials = { username: '管理员', password: 'fixture-admin-long-pass', seconds: 86400 }
    expect(await (await get('/auth/status')).json()).toMatchObject({ enabled: true, needsSetup: true, username: null })
    expect((await get('/health')).status).toBe(401)
    expect((await post('/auth/setup', { ...credentials, setupCode: 'invalid' })).status).toBe(403)
    expect((await post('/auth/setup', { ...credentials, setupCode }, '', 'https://unrelated.invalid')).status).toBe(403)
    const concurrent = await Promise.all([post('/auth/setup', { ...credentials, setupCode }), post('/auth/setup', { ...credentials, setupCode })])
    expect(concurrent.map((r) => r.status).sort()).toEqual([200, 409])
    const created = concurrent.find((r) => r.ok)!
    expect(await created.json()).toMatchObject({ username: credentials.username, expiresAt: 86400000 })
    const header = created.headers.get('set-cookie')!
    expect(header).toMatch(/HttpOnly; SameSite=Strict; Secure; Max-Age=86400/)
    const cookie = header.split(';')[0]
    expect((await get('/health', cookie)).status).toBe(200)
    expect((await get('/health', cookie, 'https://unrelated.invalid')).status).toBe(401)

    auth.close()
    auth = openStudioAuth(settings, () => now)
    api = handle()
    expect((await get('/health', cookie)).status).toBe(200)
    now = 86400000
    expect((await get('/health', cookie)).status).toBe(401)
    expect((await post('/auth/login', { ...credentials, password: 'incorrect' })).status).toBe(401)
    const login = await post('/auth/login', { ...credentials, seconds: 604800 })
    expect(login.status).toBe(200)
    const newCookie = login.headers.get('set-cookie')!.split(';')[0]
    expect((await post('/auth/logout', {}, newCookie)).status).toBe(200)
    expect((await get('/health', newCookie)).status).toBe(401)
  } finally {
    auth.close()
    await rm(dataDir, { recursive: true, force: true })
  }
})

it('scopes the DSH credential and never returns stored secrets', async () => {
  const { loadIntegrations } = await import('../../server/integrations.mjs')
  const { hash } = await import('node:crypto')
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'studio-integration-'))
  const auth = openStudioAuth({ config: { dataDir }, setupCode: 'fixture-secret-setup' })
  try {
    const settings = { config: { dataDir }, auth, token: '', komgaAllowedUrls: ['http://komga:25600'] }
    const integrations = await loadIntegrations(settings)
    const api = createApi({ dartAvailable: true }, { ...settings, integrations }, { warn() {} })
    async function send(method: string, target: string, data?: object, cookie = '', bearer = '') {
      const headers = new Headers()
      let status = 0
      let payload = ''
      const req = { method, socket: { remoteAddress: '127.0.0.1' }, headers: {
        host: 'localhost', 'content-type': 'application/json', cookie, authorization: bearer ? 'Bearer ' + bearer : '',
      }, async *[Symbol.asyncIterator]() { if (data) yield Buffer.from(JSON.stringify(data)) } }
      const res = { setHeader(name: string, value: string) { headers.set(name, value) },
        writeHead(code: number) { status = code }, end(value: string) { payload = value } }
      await api(req, res, new URL(target, 'http://localhost'))
      return new Response(payload, { status, headers })
    }
    const setup = await send('POST', '/api/auth/setup', { username: 'owner', password: 'fixture-admin-pass', setupCode: 'fixture-secret-setup' })
    const cookie = setup.headers.get('set-cookie')!.split(';')[0]
    const route = '/api/settings/integrations'
    const before = await (await send('GET', route, undefined, cookie)).json()
    expect(before.preferences).toEqual({ scrapeEnabled: false, scraperConfigured: false, refreshMode: 'after-sync' })
    const preferences = { action: 'save-komga-preferences', scrapeEnabled: true, refreshMode: 'manual' }
    expect((await send('POST', route, preferences)).status).toBe(401)
    expect((await send('POST', route, { ...preferences, scrapeEnabled: 'true' }, cookie)).status).toBe(400)
    expect((await send('POST', route, { ...preferences, refreshMode: 'invalid' }, cookie)).status).toBe(400)
    const saved = await (await send('POST', route, preferences, cookie)).json()
    expect(saved.preferences).toEqual({ scrapeEnabled: true, scraperConfigured: false, refreshMode: 'manual' })
    expect((await loadIntegrations(settings))?.preferences).toEqual({ scrapeEnabled: true, refreshMode: 'manual' })
    const invalid = await send('POST', route, { action: 'save-komga', url: 'http://unapproved.invalid', apiKey: 'abc' }, cookie)
    expect(invalid.status).toBe(400)
    const first = await (await send('POST', route, { action: 'rotate-dsh' }, cookie)).json()
    expect(first.token).toMatch(/^studio_dsh_/)
    const stored = await readFile(path.join(dataDir, 'auth', 'integrations.json'), 'utf8')
    expect(stored).not.toContain(first.token)
    expect(stored).toContain(hash('sha256', first.token, 'hex'))
    expect(await (await send('GET', route, undefined, cookie)).json()).not.toHaveProperty('token')
    expect((await send('GET', '/api/health', undefined, '', first.token)).status).toBe(200)
    expect((await send('GET', route, undefined, '', first.token)).status).toBe(403)
    expect((await send('POST', route, preferences, '', first.token)).status).toBe(403)
    expect((await send('POST', '/api/tasks', {}, '', first.token)).status).toBe(403)
    const second = await (await send('POST', route, { action: 'rotate-dsh' }, cookie)).json()
    expect((await send('GET', '/api/health', undefined, '', first.token)).status).toBe(401)
    expect((await send('GET', '/api/health', undefined, '', second.token)).status).toBe(200)
    await send('POST', route, { action: 'revoke-dsh' }, cookie)
    expect((await send('GET', '/api/health', undefined, '', second.token)).status).toBe(401)
  } finally {
    auth.close()
    await rm(dataDir, { recursive: true, force: true })
  }
})

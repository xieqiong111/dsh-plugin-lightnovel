import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { createDownloadFoldersApi, komgaSubfolder } from '../../server/download-folders-api.mjs'
import { createKomgaClient } from '../../server/komga-client.mjs'

it('maps only overlapping NAS paths, including the Komga file URI variant', () => {
  expect(komgaSubfolder('/vol1/漫画/Suwayomi', 'file:///vol1/%E6%BC%AB%E7%94%BB')).toBe('')
  expect(komgaSubfolder('/vol1/漫画', '/vol1/漫画/收藏')).toBe('收藏')
  expect(komgaSubfolder('/vol1/漫画', '/vol1/漫画2')).toBeNull()
  expect(komgaSubfolder('/vol1/漫画', 'file://other/vol1/漫画')).toBeNull()
  expect(komgaSubfolder('/vol1/漫画', '/vol1/漫画/.private')).toBeNull()
})

it('persists an authorized library path and reports the real scan acceptance separately', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-folder-sync-'))
  const mount = path.join(root, 'manga')
  await mkdir(path.join(mount, '收藏'), { recursive: true })
  await mkdir(path.join(mount, '其他'))
  await symlink(root, path.join(mount, 'outside'))
  const fetchImpl = vi.fn(async (input: string, _init?: RequestInit) => {
    if (input.endsWith('/api/v1/libraries')) return Response.json([
      { id: 'manga', name: '漫画', root: '/NAS/漫画/收藏' },
      { id: 'other', name: '其他', root: '/NAS/漫画/其他' },
      { id: 'novel', name: '轻小说', root: '/NAS/轻小说' },
      { id: 'link', name: '链接', root: '/NAS/漫画/outside' },
    ])
    if (input.endsWith('/manga/scan') || input.endsWith('/other/scan')) return new Response(null, { status: 202 })
    if (input.endsWith('/novel/scan')) return new Response(null, { status: 403 })
    return new Response(null, { status: 404 })
  })
  const komga = createKomgaClient({ url: 'http://komga:25600', apiKey: 'fixture' }, { fetchImpl })
  const preferences = { refreshMode: 'after-sync' }
  const handle = createDownloadFoldersApi({
    integrations: { preferences },
    config: { downloadFoldersFile: path.join(root, 'folders.json') },
    mangaStorageRoot: mount,
    mangaStorageLabel: '/NAS/漫画',
    auth: { sessionAllowed: (req: { headers: { cookie?: string } }) => req.headers.cookie === 'admin' },
  }, () => komga)
  const route = '/api/settings/download-folders'
  async function call(method: string, url: string, value?: object, loggedIn = true) {
    const req = {
      method, headers: { 'content-type': 'application/json', cookie: loggedIn ? 'admin' : '' },
      async *[Symbol.asyncIterator]() { if (value) yield Buffer.from(JSON.stringify(value)) },
    }
    let status = 0
    let content = ''
    const res = {
      writeHead(code: number) { status = code },
      end(body: string) { content = body },
    }
    await handle(req, res, new URL(route + url, 'http://localhost'))
    return { status, body: JSON.parse(content) }
  }
  try {
    expect((await call('GET', '/browse?kind=manga')).body.entries).toEqual(['其他', '收藏'])
    expect((await call('GET', '/komga?kind=manga', undefined, false)).status).toBe(403)
    expect((await call('GET', '/komga?kind=manga')).body.libraries).toEqual([
      { id: 'manga', name: '漫画', selectable: true, folder: '收藏' },
      { id: 'other', name: '其他', selectable: true, folder: '其他' },
      { id: 'novel', name: '轻小说', selectable: false, folder: null },
      { id: 'link', name: '链接', selectable: false, folder: null },
    ])
    expect((await call('POST', '/komga', { kind: 'manga', action: 'sync', libraryId: 'novel' })).status).toBe(409)
    const saved = await call('POST', '/komga', { kind: 'manga', action: 'sync', libraryId: 'manga' })
    expect(saved.body).toMatchObject({ folders: { manga: { folder: '收藏' } }, scan: { accepted: true } })
    const scanRequest = fetchImpl.mock.calls.find(([url]) => url.endsWith('/manga/scan'))
    expect(scanRequest).toMatchObject(['http://komga:25600/api/v1/libraries/manga/scan', { method: 'POST', redirect: 'error' }])
    const rejected = await call('POST', '/komga', { kind: 'manga', action: 'scan', libraryId: 'novel' })
    expect(rejected.body.scan).toMatchObject({ accepted: false, message: expect.stringContaining('管理员权限') })
    expect((await call('GET', '')).body.manga.folder).toBe('收藏')

    preferences.refreshMode = 'manual'
    expect((await call('GET', '/komga?kind=manga')).body.refreshOnSync).toBe(false)
    const noScan = await call('POST', '/komga', { kind: 'manga', action: 'sync', libraryId: 'other' })
    expect(noScan.body).toMatchObject({ folders: { manga: { folder: '其他' } }, scan: { accepted: false, skipped: true } })
    expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/other/scan'))).toBe(false)
    const manual = await call('POST', '/komga', { kind: 'manga', action: 'scan', libraryId: 'other' })
    expect(manual.body.scan).toMatchObject({ accepted: true })
    expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/other/scan'))).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

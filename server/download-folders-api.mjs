import { constants } from 'node:fs'
import { access, chmod, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { folderWithin, readDownloadFolders, validSubfolder } from '../dist/core/download-folders.js'
import { atomicWriteJson } from '../dist/util/json.js'

export function createDownloadFoldersApi(settings) {
  const { config, mangaStorageRoot } = settings
  const roots = { novel: config?.novelStorageRoot, manga: mangaStorageRoot }
  const filename = config?.downloadFoldersFile
  const labels = {
    novel: settings.novelStorageLabel || roots.novel,
    manga: settings.mangaStorageLabel || roots.manga,
  }
  let pending = Promise.resolve()

  function reply(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  const fail = (res, status, code, message) => reply(res, status, { error: { code, message } })
  async function body(req) {
    if (String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') throw Error('JSON required')
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 4096) throw Error('Request too large')
      chunks.push(chunk)
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Expected an object')
    return data
  }

  async function folders() {
    const saved = filename ? await readDownloadFolders(filename) : { novelFolder: null, mangaFolder: '' }
    return {
      novel: { enabled: Boolean(filename && roots.novel), root: labels.novel ?? null, folder: saved.novelFolder, legacyFolder: config?.libraryDir },
      manga: { enabled: Boolean(filename && roots.manga), root: labels.manga ?? null, folder: saved.mangaFolder },
    }
  }

  return async (req, res, url) => {
    if (!['/api/settings/download-folders', '/api/settings/download-folders/browse'].includes(url.pathname)) return false
    // Do not expose filesystem settings to an unauthenticated BFF installation.
    if (!settings.auth && !settings.token) {
      fail(res, 403, 'ADMIN_REQUIRED', '启用管理员登录后才可设置下载目录。')
      return true
    }
    const browse = url.pathname.endsWith('/browse')
    if (req.method === 'GET' && !browse) {
      try { reply(res, 200, await folders()) }
      catch { fail(res, 503, 'SETTINGS_UNAVAILABLE', '暂时无法读取下载目录设置。') }
      return true
    }
    try {
      if (browse && req.method === 'GET') {
        const kind = url.searchParams.get('kind')
        const root = kind === 'novel' || kind === 'manga' ? roots[kind] : null
        const folder = url.searchParams.get('folder') ?? ''
        if (!root || !filename) throw Error('Root not configured')
        const dir = await folderWithin(root, folder)
        const entries = (await readdir(dir, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory() && validSubfolder(entry.name) && !/ \[-?\d+-\d+\]$/.test(entry.name))
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
        reply(res, 200, { folder, entries })
      } else if (req.method === 'POST' && !browse) {
        const { kind, folder, create = false } = await body(req)
        const root = kind === 'novel' || kind === 'manga' ? roots[kind] : null
        const resetNovel = kind === 'novel' && folder === null && create === false
        if (!root || !filename || typeof create !== 'boolean' || (!resetNovel && !validSubfolder(folder))) throw Error('Invalid target')
        const save = pending.then(async () => {
          if (folder !== null) {
            if (create && folder) {
              const parent = await folderWithin(root, path.posix.dirname(folder) === '.' ? '' : path.posix.dirname(folder))
              const target = path.join(parent, path.posix.basename(folder))
              await mkdir(target, { mode: 0o700 })
              await chmod(target, 0o700)
            }
            const destination = await folderWithin(root, folder)
            await access(destination, constants.W_OK | constants.X_OK)
            if (kind === 'manga' && / \[-?\d+-\d+\]$/.test(path.basename(destination))) {
              throw new Error('A manga series folder cannot be a storage root')
            }
          }
          const saved = await readDownloadFolders(filename)
          if (kind === 'novel') saved.novelFolder = folder
          else if (saved.mangaFolder !== folder) {
            saved.mangaPrevious = [...new Set([...saved.mangaPrevious, saved.mangaFolder])].filter((old) => old !== folder)
            saved.mangaFolder = folder
          }
          await atomicWriteJson(filename, saved)
        })
        pending = save.catch(() => undefined)
        await save
        reply(res, 200, await folders())
      } else {
        fail(res, 405, 'METHOD_NOT_ALLOWED', '请求方法不支持。')
      }
    } catch {
      fail(res, 400, 'INVALID_FOLDER', '无法使用这个目录，请检查路径是否存在、是否可写。新目录的上级须已存在。')
    }
    return true
  }
}

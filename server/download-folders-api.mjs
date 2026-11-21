import { constants } from 'node:fs'
import { access, chmod, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { folderWithin, readDownloadFolders, validSubfolder } from '../dist/core/download-folders.js'
import { atomicWriteJson } from '../dist/util/json.js'
import { KomgaError } from './komga-client.mjs'
import { createKomgaScanner } from './komga-scan.mjs'

const base = '/api/settings/download-folders'
const kindValid = (kind) => kind === 'novel' || kind === 'manga'

class FolderError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

// Komga and Studio use the same NAS path labels. Only a shared subtree can be selected.
export function komgaSubfolder(mountLabel, root) {
  if (typeof root !== 'string' || !mountLabel || !path.posix.isAbsolute(mountLabel)) return null
  let library
  try {
    library = root.startsWith('file:') ? fileURLToPath(root, { windows: false }) : root
  } catch {
    return null
  }
  if (!path.posix.isAbsolute(library) || library.includes('\\') || /[\x00-\x1f\x7f]/.test(library)) return null
  const relative = path.posix.relative(mountLabel, library)
  if (validSubfolder(relative)) return relative
  if (validSubfolder(path.posix.relative(library, mountLabel))) return ''
  return null
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  if (String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new FolderError(415, 'JSON_REQUIRED', '请使用 JSON 提交。')
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 4096) throw new FolderError(413, 'BODY_TOO_LARGE', '提交内容过大。')
    chunks.push(chunk)
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (data && typeof data === 'object' && !Array.isArray(data)) return data
  } catch { /* malformed JSON */ }
  throw new FolderError(400, 'INVALID_JSON', '提交的 JSON 无效。')
}

export function createDownloadFoldersApi(settings, getKomga, scan = createKomgaScanner()) {
  const { config, mangaStorageRoot } = settings
  const roots = { novel: config?.novelStorageRoot, manga: mangaStorageRoot }
  const filename = config?.downloadFoldersFile
  const labels = {
    novel: settings.novelStorageLabel || roots.novel,
    manga: settings.mangaStorageLabel || roots.manga,
  }
  let pending = Promise.resolve()
  const refreshOnSync = () => settings.integrations?.preferences?.refreshMode !== 'manual'

  async function folders() {
    const saved = filename ? await readDownloadFolders(filename) : { novelFolder: null, mangaFolder: '' }
    return {
      novel: { enabled: Boolean(filename && roots.novel), root: labels.novel ?? null, folder: saved.novelFolder, legacyFolder: config?.libraryDir },
      manga: { enabled: Boolean(filename && roots.manga), root: labels.manga ?? null, folder: saved.mangaFolder },
    }
  }

  function requireMount(kind) {
    if (!kindValid(kind) || !roots[kind] || !filename) {
      throw new FolderError(400, 'MOUNT_REQUIRED', '此类型尚未配置 NAS 目录挂载。')
    }
    return roots[kind]
  }

  async function writable(kind, folder) {
    const destination = await folderWithin(requireMount(kind), folder)
    await access(destination, constants.W_OK | constants.X_OK)
    if (kind === 'manga' && / \[-?\d+-\d+\]$/.test(path.basename(destination))) {
      throw Error('A manga series folder cannot be a storage root')
    }
  }

  async function saveFolder(kind, folder, create = false) {
    const root = requireMount(kind)
    const reset = kind === 'novel' && folder === null && create === false
    if (typeof create !== 'boolean' || (!reset && !validSubfolder(folder))) throw Error('Invalid target')
    const save = pending.then(async () => {
      if (folder !== null) {
        if (create && folder) {
          const parent = await folderWithin(root, folder.split('/').slice(0, -1).join('/'))
          const target = path.join(parent, path.posix.basename(folder))
          await mkdir(target, { mode: 0o700 })
          await chmod(target, 0o700)
        }
        await writable(kind, folder)
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
    return folders()
  }

  async function komgaChoices(kind) {
    requireMount(kind)
    const client = getKomga()
    const { libraries } = await client.libraries({ includePaths: true })
    const entries = await Promise.all(libraries.slice(0, 200).map(async (library) => {
      const folder = komgaSubfolder(labels[kind], library.root)
      let selectable = folder !== null
      if (selectable) {
        try { await writable(kind, folder) } catch { selectable = false }
      }
      return { id: library.id, name: library.name, selectable, folder: selectable ? folder : null }
    }))
    return { client, entries }
  }

  return async (req, res, url) => {
    if (![base, base + '/browse', base + '/komga'].includes(url.pathname)) return false
    const isKomga = url.pathname === base + '/komga'
    try {
      if (isKomga ? !settings.auth?.sessionAllowed(req) : !settings.auth && !settings.token) {
        throw new FolderError(403, 'ADMIN_REQUIRED', '请登录管理员账号后操作。')
      }
      if (req.method === 'GET' && url.pathname === base) reply(res, 200, await folders())
      else if (req.method === 'GET' && url.pathname === base + '/browse') {
        const folder = url.searchParams.get('folder') ?? ''
        const kind = url.searchParams.get('kind')
        const dir = await folderWithin(requireMount(kind), folder)
        const entries = (await readdir(dir, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory() && validSubfolder(entry.name) && !(kind === 'manga' && / \[-?\d+-\d+\]$/.test(entry.name)))
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
        reply(res, 200, { folder, entries })
      } else if (req.method === 'POST' && url.pathname === base) {
        const { kind, folder, create } = await readBody(req)
        reply(res, 200, await saveFolder(kind, folder, create))
      } else if (isKomga && req.method === 'GET') {
        const { entries } = await komgaChoices(url.searchParams.get('kind'))
        reply(res, 200, { libraries: entries, refreshOnSync: refreshOnSync() })
      } else if (isKomga && req.method === 'POST') {
        const { kind, libraryId, action } = await readBody(req)
        if (!['sync', 'scan'].includes(action) || typeof libraryId !== 'string') {
          throw new FolderError(400, 'INVALID_ACTION', '请选择有效的书库和操作。')
        }
        const { client, entries } = await komgaChoices(kind)
        const library = entries.find((item) => item.id === libraryId)
        if (!library || (action === 'sync' && !library.selectable)) {
          throw new FolderError(409, 'KOMGA_LIBRARY_OUTSIDE_MOUNT', '书库不在此类型可写的 NAS 挂载范围内。')
        }
        const saved = action === 'sync' ? await saveFolder(kind, library.folder) : await folders()
        const scanResult = action === 'scan' || refreshOnSync()
          ? await scan(client, library.id)
          : { accepted: false, skipped: true, message: '已跳过自动刷新。' }
        reply(res, 200, { folders: saved, scan: scanResult })
      } else throw new FolderError(405, 'METHOD_NOT_ALLOWED', '请求方法不支持。')
    } catch (error) {
      const detail = error instanceof FolderError || error instanceof KomgaError ? error
        : new FolderError(400, 'INVALID_FOLDER', '无法使用这个目录，请检查路径是否存在、是否可写。新目录的上级须已存在。')
      reply(res, detail.status, { error: { code: detail.code, message: detail.message } })
    }
    return true
  }
}

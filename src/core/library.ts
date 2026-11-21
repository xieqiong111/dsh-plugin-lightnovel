import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, rename, realpath, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { folderWithin, readDownloadFolders } from './download-folders.js'
import { verifyEpub } from './integrity.js'
import type { LibraryEntry, LibraryIndexFile, TaskArtifact } from '../types.js'
import { readJson } from '../util/json.js'
import { safeResolve, sanitizeFileName } from '../util/paths.js'
import type { Logger } from '../util/logger.js'

/** On-disk EPUB library with integrity verification and a portable index. */
export class Library {
  private entries = new Map<string, LibraryEntry>()
  private loaded = false
  private chain: Promise<void> = Promise.resolve()
  private additions: Promise<unknown> = Promise.resolve()

  constructor(private readonly libraryDir: string, private readonly logger: Logger,
    private readonly storage?: { root: string; settingsFile: string }) {}

  private async root(folder: string | undefined): Promise<string> {
    if (folder === undefined) return this.libraryDir
    if (!this.storage?.root) throw new Error('Novel storage mount is unavailable')
    return folderWithin(this.storage.root, folder)
  }

  async filePath(entry: LibraryEntry): Promise<string> {
    const root = await this.root(entry.storageFolder)
    const file = safeResolve(root, entry.relativePath)
    if (entry.storageFolder !== undefined && (await realpath(file)) !== file) {
      throw new Error('Novel archive contains a symbolic link')
    }
    return file
  }

  private get indexPath(): string {
    return safeResolve(this.libraryDir, 'index.json')
  }

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    const file = await readJson<LibraryIndexFile>(this.indexPath, { version: 1, entries: [] })
    // One physical EPUB path maps to exactly one index entry. Older builds of
    // add() appended a second entry when the same volume was downloaded again;
    // the file was overwritten in place, so the stale entry kept a sha256 that
    // no longer matches and verify() reported a false corruption forever.
    // Heal such indexes on load by keeping the newest entry for each path.
    const byPath = new Map<string, LibraryEntry>()
    let duplicates = 0
    for (const entry of file.entries ?? []) {
      if (!entry || typeof entry.id !== 'string') continue
      const key = JSON.stringify([entry.storageFolder ?? null, entry.relativePath ?? entry.id])
      const previous = byPath.get(key)
      if (!previous) {
        byPath.set(key, entry)
        continue
      }
      duplicates++
      if ((entry.createdAt ?? '') >= (previous.createdAt ?? '')) byPath.set(key, entry)
    }
    this.entries = new Map([...byPath.values()].map((entry) => [entry.id, entry]))
    if (duplicates > 0) {
      this.logger.warn('library', 'deduplicated_index', { removed: duplicates, remaining: this.entries.size })
      await this.persist()
    }
  }

  list(options: { query?: string; limit?: number } = {}): LibraryEntry[] {
    const query = (options.query ?? '').trim().toLowerCase()
    return [...this.entries.values()]
      .filter((e) => !query || `${e.title} ${e.author} ${e.volumeNames.join(' ')}`.toLowerCase().includes(query))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(Math.max(options.limit ?? 20, 1), 200))
  }

  get(id: string): LibraryEntry | undefined {
    return this.entries.get(id)
  }

  stats(): { total: number; bytes: number; chapters: number; ok: number; failed: number } {
    const all = [...this.entries.values()]
    return {
      total: all.length,
      bytes: all.reduce((sum, e) => sum + e.bytes, 0),
      chapters: all.reduce((sum, e) => sum + e.chapterCount, 0),
      ok: all.filter((e) => e.integrity === 'ok').length,
      failed: all.filter((e) => e.integrity !== 'ok').length,
    }
  }

  /** Copy one verified artefact into the library. Returns null on integrity failure. */
  add(input: {
    artifact: TaskArtifact
    title: string
    author: string
    sourceId: string
    bookId: string
    taskId: string
  }): Promise<LibraryEntry | null> {
    const result = this.additions.then(() => this.ingest(input))
    this.additions = result.catch(() => undefined)
    return result
  }

  private async ingest(input: Parameters<Library['add']>[0]): Promise<LibraryEntry | null> {
    await this.load()
    const integrity = await verifyEpub(input.artifact.path)
    const base = sanitizeFileName(input.title, 'novel')
    const volume = sanitizeFileName(input.artifact.volumeNames[0] ?? base, `${randomUUID().slice(0, 8)}.epub`)
    const relativePath = path.join(base, volume.endsWith('.epub') ? volume : `${volume}.epub`)
    const storageFolder = this.storage?.root
      ? (await readDownloadFolders(this.storage.settingsFile)).novelFolder ?? undefined : undefined
    const root = await this.root(storageFolder)
    const destination = safeResolve(root, relativePath)
    const series = path.dirname(destination)
    await mkdir(series, { recursive: true })
    if (storageFolder !== undefined && !(await lstat(series)).isDirectory()) throw new Error('Invalid novel series directory')
    const staging = `${destination}.${randomUUID()}.tmp`
    try {
      await copyFile(input.artifact.path, staging, constants.COPYFILE_EXCL)
      await writeFile(`${staging}.sha256`, `${integrity.sha256}  ${path.basename(destination)}\n`, { flag: 'wx' })
      await rename(staging, destination)
      await rename(`${staging}.sha256`, `${destination}.sha256`)
    } finally {
      await rm(staging, { force: true })
      await rm(`${staging}.sha256`, { force: true })
    }

    const fileStat = await stat(destination)
    const entry: LibraryEntry = {
      id: `lib_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      bookId: input.bookId,
      sourceId: input.sourceId,
      title: input.title,
      author: input.author,
      volumeNames: input.artifact.volumeNames,
      chapterCount: integrity.chapters,
      relativePath,
      ...(storageFolder !== undefined ? { storageFolder } : {}),
      bytes: fileStat.size,
      sha256: integrity.sha256,
      createdAt: new Date().toISOString(),
      taskId: input.taskId,
      integrity: integrity.ok ? 'ok' : 'failed',
    }
    // Re-downloading the same volume overwrites the EPUB in place. Replace any
    // older entry for that exact path so its stale sha256 can never make a
    // later verify() fail with a false corruption report.
    let replaced = 0
    for (const [id, existing] of this.entries) {
      if (existing.relativePath === relativePath && existing.storageFolder === storageFolder) {
        this.entries.delete(id)
        replaced++
      }
    }
    this.entries.set(entry.id, entry)
    if (replaced > 0) {
      this.logger.info('library', 'replaced', { relativePath, replaced })
    }
    await this.persist()
    this.logger.info('library', 'added', {
      id: entry.id, relativePath, integrity: entry.integrity, problems: integrity.problems,
    })
    return integrity.ok ? entry : null
  }

  /** Re-verify a single entry or the whole library. */
  async verify(id?: string): Promise<Array<{ id: string; ok: boolean; problems: string[]; sha256Changed: boolean }>> {
    await this.load()
    const targets = id ? [this.entries.get(id)].filter((e): e is LibraryEntry => !!e) : [...this.entries.values()]
    const results: Array<{ id: string; ok: boolean; problems: string[]; sha256Changed: boolean }> = []
    for (const entry of targets) {
      try {
        const absolute = await this.filePath(entry)
        const result = await verifyEpub(absolute)
        const sha256Changed = result.sha256 !== entry.sha256
        entry.integrity = result.ok && !sha256Changed ? 'ok' : 'failed'
        results.push({ id: entry.id, ok: entry.integrity === 'ok', problems: result.problems, sha256Changed })
      } catch (error) {
        entry.integrity = 'failed'
        results.push({ id: entry.id, ok: false, problems: [String(error)], sha256Changed: false })
      }
    }
    await this.persist()
    return results
  }

  async readChecksums(): Promise<string[]> {
    const out: string[] = []
    for (const entry of this.entries.values()) {
      try {
        const sidecar = `${await this.filePath(entry)}.sha256`
        if (entry.storageFolder !== undefined && !(await lstat(sidecar)).isFile()) continue
        out.push((await readFile(sidecar, 'utf8')).trim())
      } catch { /* no sidecar for older entries */ }
    }
    return out
  }

  async remove(id: string): Promise<boolean> {
    const entry = this.entries.get(id)
    if (!entry) return false
    const root = await this.root(entry.storageFolder)
    const file = safeResolve(root, entry.relativePath)
    if (entry.storageFolder !== undefined && await realpath(path.dirname(file)) !== path.dirname(file)) {
      throw new Error('Novel archive contains a symbolic link')
    }
    await rm(file, { force: true })
    await rm(`${file}.sha256`, { force: true })
    this.entries.delete(id)
    await this.persist()
    return true
  }

  private persist(): Promise<void> {
    const file: LibraryIndexFile = { version: 1, entries: [...this.entries.values()] }
    this.chain = this.chain
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.libraryDir, { recursive: true })
        await writeFile(`${this.indexPath}.tmp`, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
        const { rename } = await import('node:fs/promises')
        await rename(`${this.indexPath}.tmp`, this.indexPath)
      })
      .catch((error) => this.logger.error('library', 'persist_failed', { error: String(error) }))
    return this.chain
  }
}

import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
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

  constructor(private readonly libraryDir: string, private readonly logger: Logger) {}

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
      const key = typeof entry.relativePath === 'string' ? entry.relativePath : entry.id
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
  async add(input: {
    artifact: TaskArtifact
    title: string
    author: string
    sourceId: string
    bookId: string
    taskId: string
  }): Promise<LibraryEntry | null> {
    await this.load()
    const integrity = await verifyEpub(input.artifact.path)
    const base = sanitizeFileName(input.title, 'novel')
    const volume = sanitizeFileName(input.artifact.volumeNames[0] ?? base, `${randomUUID().slice(0, 8)}.epub`)
    const relativePath = path.join(base, volume.endsWith('.epub') ? volume : `${volume}.epub`)
    const destination = safeResolve(this.libraryDir, relativePath)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(input.artifact.path, destination)
    await writeFile(`${destination}.sha256`, `${integrity.sha256}  ${path.basename(destination)}\n`, 'utf8')

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
      if (existing.relativePath === relativePath) {
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
        const absolute = safeResolve(this.libraryDir, entry.relativePath)
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
        out.push((await readFile(safeResolve(this.libraryDir, `${entry.relativePath}.sha256`), 'utf8')).trim())
      } catch { /* no sidecar for older entries */ }
    }
    return out
  }

  async remove(id: string): Promise<boolean> {
    const entry = this.entries.get(id)
    if (!entry) return false
    await rm(safeResolve(this.libraryDir, entry.relativePath), { force: true })
    await rm(safeResolve(this.libraryDir, `${entry.relativePath}.sha256`), { force: true })
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

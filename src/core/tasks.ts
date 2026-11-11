import { rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { ResolvedConfig } from '../config.js'
import type { DartBridge, DartError } from './bridge.js'
import { verifyEpub } from './integrity.js'
import type { Library } from './library.js'
import type { TaskStore } from './store.js'
import type { SourceRegistry } from '../sources/registry.js'
import type { BridgeEvent, DownloadRequest, TaskArtifact, TaskRecord, TaskState } from '../types.js'
import { safeResolve } from '../util/paths.js'
import type { Logger } from '../util/logger.js'

interface Active {
  controller: AbortController
  cancelFile: string
}

/** Owns the download state machine: queue, progress, cancel, retry, recovery. */
export class TaskManager {
  private readonly active = new Map<string, Active>()
  private readonly queued: string[] = []
  private disposed = false

  constructor(
    private readonly config: ResolvedConfig,
    private readonly store: TaskStore,
    private readonly bridge: DartBridge,
    private readonly library: Library,
    private readonly registry: SourceRegistry,
    private readonly logger: Logger,
  ) {}

  async init(): Promise<void> {
    await this.store.load()
    await this.library.load()
    const recoverable = this.store.list().filter((t) => t.state === 'interrupted')
    for (const task of recoverable) {
      this.logger.info('tasks', 'recoverable', { taskId: task.id })
    }
    void this.pump()
  }

  get(id: string): TaskRecord | undefined {
    return this.store.get(id)
  }

  list(options: { state?: TaskState; limit?: number } = {}): TaskRecord[] {
    return this.store.list()
      .filter((t) => !options.state || t.state === options.state)
      .slice(0, Math.min(Math.max(options.limit ?? 20, 1), 200))
  }

  async start(request: DownloadRequest): Promise<TaskRecord> {
    const id = `task_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    const now = new Date().toISOString()
    const record: TaskRecord = {
      id,
      state: 'queued',
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
      request,
      progress: {
        phase: 'queued',
        percent: 0,
        volumesTotal: request.volumeNames.length || 1,
        volumesDone: 0,
        chaptersTotal: 0,
        chaptersDone: 0,
        currentVolume: null,
        currentChapter: null,
      },
      downloadedChapters: [],
      downloadedVolumes: [],
      artifacts: [],
      retryCount: 0,
      error: null,
      warnings: [],
    }
    await this.store.create(record)
    this.logger.info('tasks', 'queued', { taskId: id, bookId: request.bookId, volumes: request.volumes })
    this.queued.push(id)
    void this.pump()
    return record
  }

  async cancel(id: string): Promise<TaskRecord> {
    const task = this.store.get(id)
    if (!task) throw new TaskManagerError('TASK_NOT_FOUND', `Task not found: ${id}`)
    if (['completed', 'failed', 'cancelled'].includes(task.state)) {
      throw new TaskManagerError('NOT_CANCELABLE', `Task ${id} is already ${task.state}`)
    }
    const active = this.active.get(id)
    if (active) {
      await writeFile(active.cancelFile, 'cancel\n', 'utf8').catch(() => undefined)
      active.controller.abort()
    }
    this.queued.splice(this.queued.indexOf(id) >>> 0, this.queued.indexOf(id) >= 0 ? 1 : 0)
    const updated = await this.store.update(id, (t) => ({
      ...t,
      state: 'cancelled',
      finishedAt: new Date().toISOString(),
      progress: { ...t.progress, phase: 'cancelled' },
      error: { code: 'CANCELLED', message: 'Cancelled by user' },
    }))
    this.logger.info('tasks', 'cancelled', { taskId: id })
    return updated
  }

  async retry(id: string): Promise<TaskRecord> {
    const task = this.store.get(id)
    if (!task) throw new TaskManagerError('TASK_NOT_FOUND', `Task not found: ${id}`)
    if (!['failed', 'cancelled', 'interrupted'].includes(task.state)) {
      throw new TaskManagerError('NOT_RETRYABLE', `Only failed/cancelled/interrupted tasks can be retried (state=${task.state})`)
    }
    if (task.retryCount >= this.config.maxRetries) {
      throw new TaskManagerError('RETRY_LIMIT', `Retry limit reached (${this.config.maxRetries})`)
    }
    const updated = await this.store.update(id, (t) => ({
      ...t,
      state: 'queued',
      startedAt: null,
      finishedAt: null,
      retryCount: t.retryCount + 1,
      error: null,
      warnings: [],
      artifacts: [],
      downloadedChapters: [],
      downloadedVolumes: [],
      progress: { ...t.progress, phase: 'queued', percent: 0, volumesDone: 0, chaptersDone: 0, chaptersTotal: 0 },
    }))
    this.queued.push(id)
    void this.pump()
    this.logger.info('tasks', 'retry_queued', { taskId: id, retryCount: updated.retryCount })
    return updated
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const [id, active] of this.active) {
      active.controller.abort()
      await writeFile(active.cancelFile, 'cancel\n', 'utf8').catch(() => undefined)
      this.logger.info('tasks', 'aborted_on_unload', { taskId: id })
    }
    this.active.clear()
    this.queued.length = 0
  }

  private async pump(): Promise<void> {
    if (this.disposed) return
    while (!this.disposed && this.active.size < Math.max(1, this.config.maxConcurrentDownloads) && this.queued.length > 0) {
      const id = this.queued.shift()!
      const task = this.store.get(id)
      if (!task || task.state !== 'queued') continue
      const controller = new AbortController()
      const cancelFile = this.store.cancelFilePath(id)
      this.active.set(id, { controller, cancelFile })
      void this.runTask(id, controller, cancelFile).finally(() => {
        this.active.delete(id)
        void this.pump()
      })
    }
  }

  private async runTask(id: string, controller: AbortController, cancelFile: string): Promise<void> {
    const task = this.store.get(id)
    if (!task) return
    const outputDir = safeResolve(this.config.tasksDir, 'work', id)
    const chapterNames: string[] = []
    let combinedChapters = 0

    await this.store.update(id, (t) => ({
      ...t,
      state: 'running',
      startedAt: new Date().toISOString(),
      progress: { ...t.progress, phase: 'starting' },
    }))

    try {
      const result = await this.bridge.run<{
        novel?: Record<string, unknown>
        artifacts?: Array<{ path: string; volumeNames: string[]; chapters: number; bytes: number }>
        downloadedChapters?: number
        downloadedVolumes?: number
      }>({
        command: 'pack',
        url: task.request.sourceUrl,
        sourceId: task.request.sourceId,
        volumes: task.request.volumes,
        outputDir,
        combine: task.request.combine,
        addChapterTitle: task.request.addChapterTitle,
        allowedSources: this.registry.dartAllowedSources(this.config),
        cancelFile,
        signal: controller.signal,
        onProgress: (event: BridgeEvent) => {
          void this.applyProgress(id, event, chapterNames)
        },
      })

      const artifacts: TaskArtifact[] = []
      for (const raw of result.data.artifacts ?? []) {
        const integrity = await verifyEpub(raw.path)
        combinedChapters += integrity.chapters
        const artifact: TaskArtifact = {
          path: raw.path,
          volumeNames: raw.volumeNames ?? [],
          chapters: integrity.chapters || raw.chapters,
          bytes: integrity.bytes || raw.bytes,
          sha256: integrity.sha256,
          integrity: integrity.ok ? 'ok' : 'failed',
          integrityError: integrity.ok ? null : integrity.problems.join('; '),
        }
        artifacts.push(artifact)
        if (integrity.ok) {
          await this.library.add({
            artifact,
            title: task.request.title,
            author: task.request.author,
            sourceId: task.request.sourceId,
            bookId: task.request.bookId,
            taskId: id,
          })
        } else {
          this.logger.error('tasks', 'integrity_failed', { taskId: id, path: raw.path, problems: integrity.problems })
        }
      }

      const failed = artifacts.filter((a) => a.integrity !== 'ok')
      await this.store.update(id, (t) => ({
        ...t,
        state: failed.length > 0 ? 'failed' : 'completed',
        finishedAt: new Date().toISOString(),
        artifacts,
        downloadedChapters: chapterNames,
        downloadedVolumes: artifacts.flatMap((a) => a.volumeNames),
        error: failed.length > 0
          ? { code: 'INTEGRITY_FAILED', message: failed.map((a) => a.integrityError).filter(Boolean).join(' | ') }
          : null,
        warnings: [
          ...t.warnings,
          ...(result.data.downloadedChapters != null && result.data.downloadedChapters !== combinedChapters
            ? [`Dart reported ${result.data.downloadedChapters} chapters, EPUB contains ${combinedChapters}`]
            : []),
        ],
        progress: {
          ...t.progress,
          phase: failed.length > 0 ? 'failed' : 'completed',
          percent: 100,
          chaptersTotal: combinedChapters,
          chaptersDone: combinedChapters,
          volumesDone: artifacts.length,
        },
      }))
      this.logger.info('tasks', 'finished', {
        taskId: id, state: failed.length > 0 ? 'failed' : 'completed',
        volumes: artifacts.length, chapters: combinedChapters,
      })
    } catch (error) {
      const dartError = error as DartError
      const code = dartError?.code ?? 'UNKNOWN'
      const cancelled = code === 'CANCELLED' || controller.signal.aborted
      await this.store.update(id, (t) => ({
        ...t,
        state: cancelled ? 'cancelled' : 'failed',
        finishedAt: new Date().toISOString(),
        downloadedChapters: chapterNames,
        error: { code: cancelled ? 'CANCELLED' : code, message: dartError?.message ?? String(error) },
        progress: { ...t.progress, phase: cancelled ? 'cancelled' : 'failed' },
      }))
      this.logger.warn('tasks', 'failed', { taskId: id, code, message: dartError?.message ?? String(error) })
    } finally {
      await rm(cancelFile, { force: true }).catch(() => undefined)
    }
  }

  private async applyProgress(id: string, event: BridgeEvent, chapterNames: string[]): Promise<void> {
    const current = this.store.get(id)
    if (!current || current.state !== 'running') return
    if (event.chapter && !chapterNames.includes(event.chapter)) chapterNames.push(event.chapter)
    await this.store.update(id, (t) => {
      const progress = { ...t.progress }
      if (event.phase === 'volume_start') {
        progress.phase = 'downloading'
        progress.currentVolume = event.volume ?? null
      } else if (event.phase === 'chapter') {
        progress.phase = 'downloading'
        progress.currentChapter = event.chapter ?? null
        progress.currentVolume = event.volume ?? progress.currentVolume
        progress.chaptersTotal = event.chapterTotal ?? progress.chaptersTotal
        progress.chaptersDone = Math.max(0, (event.chapterIndex ?? 1) - 1)
        const total = progress.chaptersTotal || 0
        const done = total > 0 ? progress.chaptersDone / total : 0
        progress.percent = Math.min(95, Math.round(done * 95))
      } else if (event.phase === 'volume_done') {
        progress.volumesDone += 1
        progress.percent = Math.min(99, Math.round((progress.volumesDone / Math.max(1, progress.volumesTotal)) * 99))
        progress.phase = 'packing'
      }
      return { ...t, progress }
    })
  }
}

export class TaskManagerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'TaskManagerError'
  }
}

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TaskStore } from '../../src/core/store.js'
import { createLogger } from '../../src/util/logger.js'
import type { TaskRecord } from '../../src/types.js'

let dir: string
const logger = createLogger('/tmp/ln-test-logs')

function record(id: string, state: TaskRecord['state'] = 'running'): TaskRecord {
  const now = new Date().toISOString()
  return {
    id, state, createdAt: now, updatedAt: now, startedAt: now, finishedAt: null,
    request: {
      bookId: 'fixture:one', sourceId: 'fixture', source: '离线测试书源',
      sourceUrl: 'fixture://novel/one.html', title: '星海旅途', author: '测试作者',
      volumes: '1', volumeNames: ['第一卷'], combine: false, addChapterTitle: true,
    },
    progress: { phase: 'downloading', percent: 50, volumesTotal: 1, volumesDone: 0, chaptersTotal: 3, chaptersDone: 1, currentVolume: '第一卷', currentChapter: '第一章' },
    downloadedChapters: ['第一章'], downloadedVolumes: [], artifacts: [],
    retryCount: 0, error: null, warnings: [],
  }
}

beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'ln-store-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('TaskStore persistence + crash recovery (requirement #9)', () => {
  it('writes one atomic JSON file per task', async () => {
    const store = new TaskStore(dir, logger)
    await store.create(record('task_a'))
    const file = path.join(dir, 'task_a.json')
    expect(JSON.parse(await readFile(file, 'utf8')).id).toBe('task_a')
    expect(store.cancelFilePath('task_a')).toBe(path.join(dir, 'task_a.cancel'))
  })

  it('marks running/queued tasks as interrupted on reload', async () => {
    const first = new TaskStore(dir, logger)
    await first.create(record('task_running', 'running'))
    await first.create(record('task_queued', 'queued'))
    await first.create(record('task_done', 'completed'))
    const second = new TaskStore(dir, logger)
    await second.load()
    expect(second.get('task_running')!.state).toBe('interrupted')
    expect(second.get('task_queued')!.state).toBe('interrupted')
    expect(second.get('task_running')!.error?.code).toBe('INTERRUPTED')
    expect(second.get('task_done')!.state).toBe('completed')
    // Recovery is persisted, not just in memory.
    expect(JSON.parse(await readFile(path.join(dir, 'task_running.json'), 'utf8')).state).toBe('interrupted')
  })

  it('survives a torn/partially written task file', async () => {
    await writeFile(path.join(dir, 'task_broken.json'), '{"id":', 'utf8')
    const store = new TaskStore(dir, logger)
    await expect(store.load()).resolves.toBeUndefined()
    expect(store.list()).toHaveLength(0)
  })

  it('update() persists mutations and refreshes updatedAt', async () => {
    const store = new TaskStore(dir, logger)
    await store.create(record('task_u'))
    const updated = await store.update('task_u', (t) => ({ ...t, state: 'completed', progress: { ...t.progress, percent: 100 } }))
    expect(updated.state).toBe('completed')
    expect(updated.progress.percent).toBe(100)
    expect(JSON.parse(await readFile(path.join(dir, 'task_u.json'), 'utf8')).state).toBe('completed')
    await expect(store.update('missing', (t) => t)).rejects.toThrow(/TASK_NOT_FOUND/)
  })

  it('rejects path traversal in task ids', async () => {
    const store = new TaskStore(dir, logger)
    await expect(store.create(record('../escape'))).rejects.toThrow()
  })
})

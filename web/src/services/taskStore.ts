import { useSyncExternalStore } from 'react'
import { novels, seedTasks } from '@/data/mock'
import type { CreateTaskInput, DownloadTask } from '@/types'
import { IS_LIVE, apiFetch } from './runtime'
import { uid } from './utils'

/* ------------------------------------------------------------------ */
/* Mock 任务仓储：静态原型专用，2.6s 假进度推进，不产生任何网络请求。      */
/* Live 任务仓储：轮询 GET /api/tasks，写操作走 POST /api/tasks/*。       */
/* ------------------------------------------------------------------ */

type Listener = () => void

export interface TaskStore {
  list(state?: DownloadTask['state']): DownloadTask[]
  runningCount(): number
  get(id: string): DownloadTask | undefined
  create(input: CreateTaskInput): Promise<DownloadTask>
  cancel(id: string): Promise<void>
  retry(id: string): Promise<void>
  pause(id: string): void
  resume(id: string): void
  refresh(): void
}

/* ---------------------------- mock --------------------------------- */

let mockTasks: DownloadTask[] = seedTasks.map((task) => ({ ...task }))
const mockListeners = new Set<Listener>()
let mockTicker: number | undefined

function mockEmit() {
  mockListeners.forEach((fn) => fn())
}

function mockSubscribe(listener: Listener) {
  mockListeners.add(listener)
  if (mockTicker === undefined) {
    mockTicker = window.setInterval(() => {
      let changed = false
      mockTasks = mockTasks.map((task) => {
        if (task.state !== 'running') return task
        const next = Math.min(99, task.percent + 1)
        if (next === task.percent) return task
        changed = true
        return { ...task, percent: next, chapterLabel: `第 ${Math.min(12, Math.ceil(next / 10))} 章` }
      })
      if (changed) mockEmit()
    }, 2600)
  }
  return () => {
    mockListeners.delete(listener)
    if (mockListeners.size === 0 && mockTicker !== undefined) {
      window.clearInterval(mockTicker)
      mockTicker = undefined
    }
  }
}

const mockStore: TaskStore = {
  list(state) {
    return state ? mockTasks.filter((task) => task.state === state) : mockTasks
  },
  runningCount() {
    return mockTasks.filter((task) => task.state === 'running' || task.state === 'queued').length
  },
  get(id) {
    return mockTasks.find((task) => task.id === id)
  },
  async create(input) {
    const novel = novels.find((item) => item.id === input.bookId) ?? novels[0]
    const task: DownloadTask = {
      id: uid('task'),
      novelId: novel.id,
      title: input.combine ? `${novel.title} · 合集` : novel.title,
      cover: novel.cover,
      coverIndex: novel.coverIndex,
      state: 'queued',
      percent: 0,
      volumeLabel: input.combine ? `${input.volumes.length} 卷合集` : input.volumeNames[0] ?? '第 1 卷',
      chapterLabel: '等待开始',
      updatedAt: '刚刚',
      isMock: true,
    }
    mockTasks = [task, ...mockTasks]
    mockEmit()
    window.setTimeout(() => {
      mockTasks = mockTasks.map((item) => (item.id === task.id ? { ...item, state: 'running', percent: 4 } : item))
      mockEmit()
    }, 1400)
    return task
  },
  async cancel(id) {
    mockTasks = mockTasks.map((task) =>
      task.id === id ? { ...task, state: 'cancelled', chapterLabel: '已取消' } : task,
    )
    mockEmit()
  },
  async retry(id) {
    mockTasks = mockTasks.map((task) =>
      task.id === id ? { ...task, state: 'queued', percent: 0, message: undefined, chapterLabel: '等待开始' } : task,
    )
    mockEmit()
    window.setTimeout(() => {
      mockTasks = mockTasks.map((task) => (task.id === id ? { ...task, state: 'running', percent: 8 } : task))
      mockEmit()
    }, 1200)
  },
  pause(id) {
    mockTasks = mockTasks.map((task) =>
      task.id === id ? { ...task, state: 'queued', chapterLabel: '已暂停 · 等待恢复' } : task,
    )
    mockEmit()
  },
  resume(id) {
    mockTasks = mockTasks.map((task) =>
      task.id === id ? { ...task, state: 'running', chapterLabel: '正在恢复' } : task,
    )
    mockEmit()
  },
  refresh() {
    mockEmit()
  },
}

/* ---------------------------- live --------------------------------- */

let liveTasks: DownloadTask[] = []
const liveListeners = new Set<Listener>()
let liveTicker: number | undefined
let polling = false

function liveEmit() {
  liveListeners.forEach((fn) => fn())
}

async function pollTasks() {
  if (polling) return
  polling = true
  try {
    liveTasks = await apiFetch<DownloadTask[]>('/tasks')
    liveEmit()
  } catch {
    // Keep the last known snapshot; the next poll retries. Errors are shown by
    // the invoking action's toast instead of flashing an empty task list.
  } finally {
    polling = false
  }
}

function liveSubscribe(listener: Listener) {
  liveListeners.add(listener)
  if (liveTicker === undefined) {
    void pollTasks()
    liveTicker = window.setInterval(() => void pollTasks(), 2000)
  }
  return () => {
    liveListeners.delete(listener)
    if (liveListeners.size === 0 && liveTicker !== undefined) {
      window.clearInterval(liveTicker)
      liveTicker = undefined
    }
  }
}

const liveStore: TaskStore = {
  list(state) {
    return state ? liveTasks.filter((task) => task.state === state) : liveTasks
  },
  runningCount() {
    return liveTasks.filter((task) => task.state === 'running' || task.state === 'queued').length
  },
  get(id) {
    return liveTasks.find((task) => task.id === id)
  },
  async create(input) {
    const task = await apiFetch<DownloadTask>('/tasks', { method: 'POST', body: JSON.stringify(input) })
    await pollTasks()
    return task
  },
  async cancel(id) {
    await apiFetch(`/tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
    await pollTasks()
  },
  async retry(id) {
    await apiFetch(`/tasks/${encodeURIComponent(id)}/retry`, { method: 'POST' })
    await pollTasks()
  },
  // The plugin supports cancel/retry, not pause/resume. The UI hides these
  // buttons in live mode rather than pretending a pause happened.
  pause() {},
  resume() {},
  refresh() {
    void pollTasks()
  },
}

export function useTasks() {
  return useSyncExternalStore(
    IS_LIVE ? liveSubscribe : mockSubscribe,
    IS_LIVE ? () => liveTasks : () => mockTasks,
    IS_LIVE ? () => liveTasks : () => mockTasks,
  )
}

export const taskStore: TaskStore = IS_LIVE ? liveStore : mockStore

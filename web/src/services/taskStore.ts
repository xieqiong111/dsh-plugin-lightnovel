import { useSyncExternalStore } from 'react'
import { novels, seedTasks } from '@/data/mock'
import type { CreateTaskInput, DownloadTask } from '@/types'
import { uid } from './utils'

/* ------------------------------------------------------------------ */
/* Mock 任务仓储：仅用于前端演示。真实实现应轮询 /api/tasks/:taskId。      */
/* ------------------------------------------------------------------ */

type Listener = () => void

let tasks: DownloadTask[] = seedTasks.map((task) => ({ ...task }))
const listeners = new Set<Listener>()
let ticker: number | undefined

function emit() {
  listeners.forEach((fn) => fn())
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  if (ticker === undefined) {
    // 演示用进度推进：真实环境由后端 progress.percent 驱动
    ticker = window.setInterval(() => {
      let changed = false
      tasks = tasks.map((task) => {
        if (task.state !== 'running') return task
        const next = Math.min(99, task.percent + 1)
        if (next === task.percent) return task
        changed = true
        return { ...task, percent: next, chapterLabel: `第 ${Math.min(12, Math.ceil(next / 10))} 章` }
      })
      if (changed) emit()
    }, 2600)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && ticker !== undefined) {
      window.clearInterval(ticker)
      ticker = undefined
    }
  }
}

function getSnapshot() {
  return tasks
}

export function useTasks() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export const taskStore = {
  list(state?: DownloadTask['state']) {
    return state ? tasks.filter((t) => t.state === state) : tasks
  },
  runningCount() {
    return tasks.filter((t) => t.state === 'running' || t.state === 'queued').length
  },
  get(id: string) {
    return tasks.find((t) => t.id === id)
  },
  create(input: CreateTaskInput): DownloadTask {
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
    tasks = [task, ...tasks]
    emit()
    window.setTimeout(() => {
      tasks = tasks.map((t) => (t.id === task.id ? { ...t, state: 'running', percent: 4 } : t))
      emit()
    }, 1400)
    return task
  },
  cancel(id: string) {
    tasks = tasks.map((t) => (t.id === id ? { ...t, state: 'cancelled', chapterLabel: '已取消' } : t))
    emit()
  },
  retry(id: string) {
    tasks = tasks.map((t) =>
      t.id === id ? { ...t, state: 'queued', percent: 0, message: undefined, chapterLabel: '等待开始' } : t,
    )
    emit()
    window.setTimeout(() => {
      tasks = tasks.map((t) => (t.id === id ? { ...t, state: 'running', percent: 8 } : t))
      emit()
    }, 1200)
  },
  pause(id: string) {
    tasks = tasks.map((t) =>
      t.id === id ? { ...t, state: 'queued', chapterLabel: '已暂停 · 等待恢复' } : t,
    )
    emit()
  },
  resume(id: string) {
    tasks = tasks.map((t) => (t.id === id ? { ...t, state: 'running', chapterLabel: '正在恢复' } : t))
    emit()
  },
}

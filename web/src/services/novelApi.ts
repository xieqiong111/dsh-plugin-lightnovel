import { activities, library, libraryStats, novels, sources, volumesByNovel } from '@/data/mock'
import type {
  ActivityItem,
  CreateTaskInput,
  DownloadTask,
  LibraryItem,
  LibraryStats,
  Novel,
  SearchQuery,
  SourceHealth,
  Volume,
} from '@/types'
import { sleep } from './utils'
import { taskStore } from './taskStore'

/**
 * 数据访问层（当前为 Mock 实现）。
 *
 * 真实接入时只需替换本文件的实现，保持函数签名不变：
 *   GET  /api/novels?query=&sources=&status=
 *   GET  /api/novels/:id
 *   GET  /api/novels/:id/volumes
 *   GET  /api/tasks?state=
 *   POST /api/tasks
 *   POST /api/tasks/:taskId/cancel | /retry
 *   GET  /api/library?query=
 *   GET  /api/library/stats
 *   GET  /api/status
 */
export const API_MODE: 'mock' | 'live' = 'mock'

export interface SearchResult {
  results: Novel[]
  total: number
  degradedSources: string[]
  /** 是否使用了本地演示数据 */
  mocked: boolean
}

export const novelApi = {
  async searchNovels({ keyword, sources: sourceIds, status }: SearchQuery): Promise<SearchResult> {
    await sleep(420)
    const query = keyword.trim().toLowerCase()
    const filtered = novels.filter((novel) => {
      const matchKeyword =
        !query ||
        novel.title.toLowerCase().includes(query) ||
        novel.author.toLowerCase().includes(query) ||
        novel.tags.some((tag) => tag.toLowerCase().includes(query))
      const matchSource = sourceIds.length === 0 || sourceIds.includes(novel.sourceId)
      const matchStatus = status === 'all' || novel.status === status
      return matchKeyword && matchSource && matchStatus
    })
    return {
      results: filtered,
      total: filtered.length,
      degradedSources: sourceIds.includes('web') ? ['公共网页源：关键词搜索不可用'] : [],
      mocked: true,
    }
  },

  async getNovel(id: string): Promise<Novel | undefined> {
    await sleep(260)
    return novels.find((novel) => novel.id === id)
  },

  async getVolumes(id: string): Promise<Volume[]> {
    await sleep(200)
    return volumesByNovel[id] ?? volumesByNovel['fixture:moon-teahouse']
  },

  async listTasks(state?: DownloadTask['state']): Promise<DownloadTask[]> {
    await sleep(160)
    return taskStore.list(state)
  },

  async createTask(input: CreateTaskInput): Promise<DownloadTask> {
    await sleep(280)
    return taskStore.create(input)
  },

  async cancelTask(id: string) {
    await sleep(180)
    taskStore.cancel(id)
  },

  async retryTask(id: string) {
    await sleep(180)
    taskStore.retry(id)
  },

  async listLibrary(keyword = ''): Promise<LibraryItem[]> {
    await sleep(220)
    const query = keyword.trim().toLowerCase()
    if (!query) return library
    return library.filter(
      (item) => item.title.toLowerCase().includes(query) || item.fileName.toLowerCase().includes(query),
    )
  },

  async getLibraryStats(): Promise<LibraryStats> {
    await sleep(120)
    return libraryStats
  },

  async getActivities(): Promise<ActivityItem[]> {
    await sleep(120)
    return activities
  },

  async getSources(): Promise<SourceHealth[]> {
    await sleep(180)
    return sources
  },

  async verifyFile(id: string) {
    await sleep(420)
    const item = library.find((entry) => entry.id === id)
    return { ok: true, id, integrity: item?.integrity ?? 'passed' }
  },
}

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
  VerifyResult,
  Volume,
} from '@/types'
import { sleep } from './utils'
import { taskStore } from './taskStore'
import { IS_LIVE, apiDownload, apiFetch, type RuntimeStatus } from './runtime'

export { API_MODE, IS_LIVE } from './runtime'

/**
 * Single data-access seam for the whole UI.
 *
 * Mock build (default): deterministic sample data, no network at all.
 * Live build (VITE_API_MODE=live): every method is an /api/* call served by
 * server/serve.mjs, which drives the plugin's PluginRuntime directly.
 *
 * Endpoint contract:
 *   GET    /api/status                     GET  /api/activities
 *   GET    /api/novels?query=&sources=&status=  GET /api/novels/:id
 *   GET    /api/novels/:id/volumes        GET  /api/tasks?state=
 *   POST   /api/tasks                     POST /api/tasks/:id/cancel | /retry
 *   GET    /api/library?query=            GET  /api/library/stats
 *   POST   /api/library/:id/verify        GET  /api/library/:id/file
 *   DELETE /api/library/:id               GET  /api/sources
 */
export interface SearchResult {
  results: Novel[]
  total: number
  degradedSources: string[]
  /** 是否使用了本地演示数据 */
  mocked: boolean
}

export interface NovelApi {
  searchNovels(query: SearchQuery): Promise<SearchResult>
  getNovel(id: string): Promise<Novel | undefined>
  getVolumes(id: string): Promise<Volume[]>
  listTasks(state?: DownloadTask['state']): Promise<DownloadTask[]>
  createTask(input: CreateTaskInput): Promise<DownloadTask>
  cancelTask(id: string): Promise<void>
  retryTask(id: string): Promise<void>
  listLibrary(keyword?: string): Promise<LibraryItem[]>
  getLibraryStats(): Promise<LibraryStats>
  getActivities(): Promise<ActivityItem[]>
  getSources(): Promise<SourceHealth[]>
  verifyFile(id: string): Promise<VerifyResult>
  getFeatured(): Promise<Novel[]>
  getStatus(): Promise<RuntimeStatus>
  downloadFile(id: string, fileName: string): Promise<void>
  deleteFile(id: string): Promise<void>
}

const queryString = (values: Record<string, string | undefined>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, value)
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/**
 * Dashboard showcase is library-first in live mode: never surface a book that
 * has not produced a real EPUB. Search remains the discovery surface.
 */
function libraryNovel(item: LibraryItem): Novel {
  return {
    id: item.novelId || item.id,
    title: item.title,
    author: item.author,
    cover: item.cover,
    coverIndex: item.coverIndex,
    volumes: item.volumes,
    source: '本地书库',
    sourceId: item.tags[0] ?? 'library',
    status: 'unknown',
    statusText: '已入库',
    summary: item.fileName,
    tags: item.tags,
    rating: 0,
    updatedAt: item.addedAt,
    isMock: false,
  }
}

const liveApi: NovelApi = {
  searchNovels({ keyword, sources: sourceIds, status }) {
    return apiFetch<SearchResult>(
      `/novels${queryString({
        query: keyword.trim(),
        sources: sourceIds.join(','),
        status: status === 'all' ? undefined : status,
      })}`,
    )
  },
  async getNovel(id) {
    try {
      return await apiFetch<Novel>(`/novels/${encodeURIComponent(id)}`)
    } catch {
      return undefined
    }
  },
  getVolumes(id) {
    return apiFetch<Volume[]>(`/novels/${encodeURIComponent(id)}/volumes`)
  },
  listTasks(state) {
    return apiFetch<DownloadTask[]>(`/tasks${queryString({ state })}`)
  },
  createTask(input) {
    return apiFetch<DownloadTask>('/tasks', { method: 'POST', body: JSON.stringify(input) })
  },
  async cancelTask(id) {
    await apiFetch(`/tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
    taskStore.refresh()
  },
  async retryTask(id) {
    await apiFetch(`/tasks/${encodeURIComponent(id)}/retry`, { method: 'POST' })
    taskStore.refresh()
  },
  listLibrary(keyword = '') {
    return apiFetch<LibraryItem[]>(`/library${queryString({ query: keyword.trim() })}`)
  },
  getLibraryStats() {
    return apiFetch<LibraryStats>('/library/stats')
  },
  getActivities() {
    return apiFetch<ActivityItem[]>('/activities')
  },
  getSources() {
    return apiFetch<SourceHealth[]>('/sources')
  },
  verifyFile(id) {
    return apiFetch<VerifyResult>(`/library/${encodeURIComponent(id)}/verify`, { method: 'POST' })
  },
  async getFeatured() {
    const items = await liveApi.listLibrary()
    return items.slice(0, 5).map(libraryNovel)
  },
  getStatus() {
    return apiFetch<RuntimeStatus>('/status')
  },
  downloadFile(id, fileName) {
    return apiDownload(`/library/${encodeURIComponent(id)}/file`, fileName)
  },
  async deleteFile(id) {
    await apiFetch(`/library/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
}

const mockApi: NovelApi = {
  async searchNovels({ keyword, sources: sourceIds, status }) {
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
  async getNovel(id) {
    await sleep(260)
    return novels.find((novel) => novel.id === id)
  },
  async getVolumes(id) {
    await sleep(200)
    return volumesByNovel[id] ?? volumesByNovel['fixture:moon-teahouse']
  },
  async listTasks(state) {
    await sleep(160)
    return taskStore.list(state)
  },
  async createTask(input) {
    await sleep(280)
    return taskStore.create(input)
  },
  async cancelTask(id) {
    await sleep(180)
    taskStore.cancel(id)
  },
  async retryTask(id) {
    await sleep(180)
    taskStore.retry(id)
  },
  async listLibrary(keyword = '') {
    await sleep(220)
    const query = keyword.trim().toLowerCase()
    if (!query) return library
    return library.filter(
      (item) => item.title.toLowerCase().includes(query) || item.fileName.toLowerCase().includes(query),
    )
  },
  async getLibraryStats() {
    await sleep(120)
    return libraryStats
  },
  async getActivities() {
    await sleep(120)
    return activities
  },
  async getSources() {
    await sleep(180)
    return sources
  },
  async verifyFile(id) {
    await sleep(420)
    const item = library.find((entry) => entry.id === id)
    return { ok: true, id, integrity: item?.integrity ?? 'passed' }
  },
  async getFeatured() {
    return novels.slice(0, 5)
  },
  async getStatus() {
    return Promise.reject(new Error('Mock 原型没有后端运行时状态'))
  },
  async downloadFile() {
    return Promise.reject(new Error('Mock 原型不提供真实 EPUB 文件'))
  },
  async deleteFile() {
    return Promise.reject(new Error('Mock 原型不会删除文件'))
  },
}

export const novelApi: NovelApi = IS_LIVE ? liveApi : mockApi

export type NovelStatus = 'ongoing' | 'completed'
export type CoverTheme = 'moon' | 'flower' | 'mountain' | 'orb' | 'city' | 'rose' | 'night' | 'paper'
export type SourceId = 'bilinovel' | 'fixture' | 'local' | 'web'

export interface Novel {
  id: string
  title: string
  author: string
  cover: CoverTheme
  coverIndex: number
  volumes: number
  source: string
  sourceId: SourceId
  status: NovelStatus
  summary: string
  tags: string[]
  rating: number
  updatedAt: string
  /** 仅演示数据标记，用于 UI 上明确区分真实业务数据 */
  isMock: boolean
}

export interface Volume {
  id: string
  index: number
  name: string
  chapters: number
  updatedAt: string
}

export type TaskState = 'running' | 'queued' | 'completed' | 'failed' | 'cancelled'

export interface DownloadTask {
  id: string
  novelId: string
  title: string
  cover: CoverTheme
  coverIndex: number
  state: TaskState
  percent: number
  volumeLabel: string
  chapterLabel: string
  speed?: string
  size?: string
  message?: string
  updatedAt: string
  isMock: boolean
}

export interface LibraryItem {
  id: string
  novelId: string
  title: string
  fileName: string
  cover: CoverTheme
  coverIndex: number
  volumeLabel: string
  size: string
  integrity: 'passed' | 'pending' | 'failed'
  addedAt: string
  tags: string[]
}

export interface LibraryStats {
  epubs: number
  tasks: number
  queued: number
  verified: number
}

export interface ActivityItem {
  id: string
  kind: 'download' | 'success' | 'failure' | 'info'
  title: string
  time: string
}

export interface SourceHealth {
  id: SourceId
  name: string
  host: string
  description: string
  state: 'online' | 'degraded' | 'offline'
  latencyMs: number | null
  successRate: number | null
  searchable: boolean
  note: string
  isMock: boolean
}

export interface SearchQuery {
  keyword: string
  sources: SourceId[]
  status: 'all' | NovelStatus
}

export interface CreateTaskInput {
  bookId: string
  volumes: string[]
  volumeNames: string[]
  combine: boolean
  addChapterTitle: boolean
}

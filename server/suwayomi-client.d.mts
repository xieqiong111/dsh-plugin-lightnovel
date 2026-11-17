export interface SuwayomiConfig {
  url?: string
  username?: string
  password?: string
  timeoutMs?: number
}

export interface SuwayomiSource {
  id: string
  name: string
  displayName: string
  lang: string
  isLocal?: boolean
}

export interface SuwayomiManga {
  id: string
  title: string
  author: string | null
  artist: string | null
  description: string | null
  genre: string[]
  thumbnailUrl: string | null
  sourceId: string
  source: SuwayomiSource | null
  url: string | null
  status: string
  inLibrary: boolean
  subscribed: boolean
  addedAt: string | null
  chapterCount: number | null
  downloadCount: number | null
  updatedAt: string | null
}

export interface SuwayomiChapter {
  id: string
  mangaId: string
  name: string
  uploadDate: string | null
  read: boolean
  downloaded: boolean
  pageCount: number
}

export interface SuwayomiTask {
  id: string
  mangaId: string
  title: string
  chapterId: string
  chapterName: string
  state: 'queued' | 'running' | 'completed' | 'failed' | 'paused' | 'unknown'
  upstreamState: string
  percent: number | null
}

export interface SuwayomiClient {
  readonly configured: boolean
  health(): Promise<{
    reachable: boolean
    authenticated: boolean | null
    compatible: boolean | null
    installedSources: number | null
    chapters: boolean | null
    version?: string
    message?: string
  }>
  sources(): Promise<{ sources: SuwayomiSource[]; totalCount: number; hasNextPage: boolean; fetchedAt: string }>
  searchManga(options?: {
    query?: string
    sourceId?: string
    type?: 'SEARCH' | 'POPULAR' | 'LATEST'
    page?: number
    offset?: number
    limit?: number
    resultId?: string
  }): Promise<{
    mangas: SuwayomiManga[]
    hasNextPage: boolean
    page: number
    offset: number
    nextOffset: number | null
    resultId: string | null
    truncated?: boolean
    note?: string
    errors: Array<{ sourceId: string; message: string; retryable?: boolean }>
    fetchedAt: string
  }>
  getManga(id: string | number): Promise<SuwayomiManga>
  getChapters(mangaId: string | number, options?: { limit?: number; offset?: number }): Promise<{
    chapters: SuwayomiChapter[]
    totalCount: number | null
    hasNextPage: boolean
    fetchedAt: string
  }>
  library(options?: { limit?: number; offset?: number }): Promise<{
    mangas: SuwayomiManga[]
    totalCount: number | null
    hasNextPage: boolean
    fetchedAt: string
  }>
  download(options: { mangaId: string | number; chapterIds: Array<string | number> }): Promise<{
    /** IDs observed in the upstream queue; this does not imply they were newly created by this call. */
    queued: string[]
    skipped: string[]
    completed: string[]
    unconfirmed?: string[]
    queue: SuwayomiTask[]
    fetchedAt?: string
  }>
  tasks(options?: { action?: 'list' | 'status' | 'cancel'; chapterIds?: Array<string | number> }): Promise<{
    queue: SuwayomiTask[]
    state: string
    count: number
    fetchedAt: string
  }>
  setLibrary(options: { mangaId: string | number; inLibrary: boolean }): Promise<SuwayomiManga>
  refreshChapters(mangaId: string | number): Promise<{
    chapters: SuwayomiChapter[]
    totalCount: number | null
    hasNextPage: boolean
    fetchedAt: string
  }>
  refreshLibrary(options?: { categoryIds?: Array<string | number> }): Promise<{ accepted: boolean; fetchedAt: string }>
  cover(id: string | number): Promise<{ contentType: string; body: Buffer }>
}

export declare class SuwayomiError extends Error {
  code: string
  status: number
  details: Record<string, unknown>
  constructor(code: string, message: string, status?: number, details?: Record<string, unknown>)
}

export declare function readSuwayomiConfig(env?: Record<string, string | undefined>): SuwayomiConfig

export declare function createSuwayomiClient(
  config?: SuwayomiConfig,
  options?: { fetchImpl?: typeof fetch; now?: () => Date; env?: Record<string, string | undefined> },
): SuwayomiClient

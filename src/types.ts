/** Shared structured data contracts. Every tool returns lossless JSON built from these. */

export type UpdateStatus = 'ongoing' | 'completed' | 'unknown'
export type AccessLevel = 'public' | 'restricted'

/** Unified cross-source search hit (requirement #4). */
export interface BookRecord {
  /** Stable id: `<sourceId>:<bookId>`. */
  id: string
  sourceId: string
  /** Human readable source name, e.g. 哔哩轻小说. */
  source: string
  /** Canonical detail-page URL on the source site. */
  sourceUrl: string
  /** Source-local numeric/string id. */
  bookId: string
  title: string
  aliases: string[]
  author: string
  coverUrl: string | null
  description: string | null
  tags: string[]
  publisher: string | null
  /** Raw status text from the source (连载中 / 已完结 / …). */
  statusText: string
  /** Normalised status for filtering. */
  status: UpdateStatus
  lastUpdated: string | null
  volumeCount: number | null
  access: AccessLevel
  /** ISO timestamp of when this record was indexed. */
  indexedAt: string
}

export interface SearchHit extends BookRecord {
  /** Relevance score, higher is better. */
  score: number
  /** Which fields matched, for explainability. */
  matchedBy: string[]
  /** Other sources where the same book was found. */
  alsoAvailableOn: string[]
}

export interface NovelDetail extends BookRecord {
  volumeCount: number
  chapterCount: number
  volumes: VolumeSummary[]
}

export interface VolumeSummary {
  index: number
  name: string
  cover: string | null
  chapterCount: number
}

export interface ChapterInfo {
  name: string
  url: string | null
}

export interface VolumeDetail extends VolumeSummary {
  chapters: ChapterInfo[]
}

export type TaskState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

export interface TaskProgress {
  phase: string
  percent: number
  volumesTotal: number
  volumesDone: number
  chaptersTotal: number
  chaptersDone: number
  currentVolume: string | null
  currentChapter: string | null
}

export interface TaskArtifact {
  path: string
  volumeNames: string[]
  chapters: number
  bytes: number
  sha256: string | null
  integrity: 'pending' | 'ok' | 'failed'
  integrityError: string | null
}

export interface DownloadRequest {
  bookId: string
  sourceId: string
  source: string
  sourceUrl: string
  title: string
  author: string
  volumes: string
  volumeNames: string[]
  combine: boolean
  addChapterTitle: boolean
}

export interface TaskRecord {
  id: string
  state: TaskState
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
  request: DownloadRequest
  progress: TaskProgress
  /** Chapter titles actually fetched and written into an EPUB. */
  downloadedChapters: string[]
  /** Volumes actually produced (EPUB artifacts). */
  downloadedVolumes: string[]
  artifacts: TaskArtifact[]
  retryCount: number
  error: { code: string; message: string } | null
  /** Warnings that did not fail the task (e.g. a single missing image). */
  warnings: string[]
}

export interface LibraryEntry {
  id: string
  bookId: string
  sourceId: string
  title: string
  author: string
  volumeNames: string[]
  chapterCount: number
  /** Path relative to the library root — never an absolute path. */
  relativePath: string
  bytes: number
  sha256: string
  createdAt: string
  taskId: string
  integrity: 'ok' | 'failed' | 'unknown'
}

export interface LibraryIndexFile {
  version: 1
  entries: LibraryEntry[]
}

export interface ToolError {
  code: string
  message: string
  retryable?: boolean
}

/** Shape of the NDJSON lines emitted by the Dart headless process. */
export interface BridgeEvent {
  type: 'start' | 'progress' | 'result' | 'error'
  ts?: string
  ok?: boolean
  code?: string
  message?: string
  command?: string
  phase?: string
  volume?: string
  chapter?: string
  chapterIndex?: number
  chapterTotal?: number
  chapters?: number
  images?: number
  path?: string
  data?: Record<string, unknown>
}

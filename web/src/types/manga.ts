import type { CoverTheme, DownloadTask, LibraryItem, TaskState } from '@/types'

export interface MangaSource {
  id: string
  name: string
  lang: string
}

export interface Manga {
  id: string
  title: string
  author: string | null
  artist: string | null
  description: string | null
  genre: string[]
  thumbnailUrl: string | null
  sourceId: string
  source?: MangaSource | null
  url: string | null
  status: string
  inLibrary: boolean
  subscribed: boolean
  chapterCount: number | null
  downloadCount: number | null
  updatedAt: string | null
  addedAt?: string | null
  mockCover?: CoverTheme
}

export interface MangaChapter {
  id: string
  name: string
  uploadDate: string | null
  read: boolean
  downloaded: boolean
  pageCount: number
}

export interface MangaTask {
  id: string
  mangaId: string
  title: string
  chapterId: string
  chapterName: string
  state: TaskState | 'unknown'
  upstreamState: string
  percent: number | null
}

export interface MangaHealth {
  reachable: boolean
  authenticated: boolean | null
  compatible: boolean | null
  installedSources: number | null
  chapters: boolean | null
  version?: string
  message?: string
}

export type UnifiedLibraryItem =
  | { type: 'novel'; id: string; format: 'EPUB'; item: LibraryItem }
  | { type: 'manga'; id: string; format: 'Suwayomi 章节'; item: Manga }

export type UnifiedDownloadTask =
  | { type: 'novel'; id: string; task: DownloadTask }
  | { type: 'manga'; id: string; task: MangaTask }

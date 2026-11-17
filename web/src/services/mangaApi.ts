import { mangaMock } from '@/data/mangaMock'
import { API_BASE, IS_LIVE, apiFetch, getApiToken } from '@/services/runtime'
import type { Manga, MangaChapter, MangaHealth, MangaSource, MangaTask } from '@/types/manga'

type MangaPage = { mangas: Manga[]; hasNextPage: boolean }
type ChapterPage = { chapters: MangaChapter[]; hasNextPage: boolean }
type SearchResult = MangaPage & { nextOffset?: number | null; resultId?: string | null; truncated?: boolean; errors?: { sourceId: string; message: string }[] }
type DownloadResult = { queued: string[]; skipped: string[]; completed?: string[]; unconfirmed?: string[] }

const mangaPath = (id: string) => `/manga/${encodeURIComponent(id)}`
const jsonPost = (body?: object): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) })

const liveMangaApi = {
  sources: () => apiFetch<{ sources: MangaSource[] }>('/manga/sources'),
  health: () => apiFetch<MangaHealth>('/manga/health'),
  search: (query: string, sourceId: string, page: number, offset: number, resultId?: string) => {
    const params = new URLSearchParams({ query, page: String(page), offset: String(offset) })
    if (sourceId) params.set('sourceId', sourceId)
    if (resultId) params.set('resultId', resultId)
    return apiFetch<SearchResult>(`/manga/search?${params}`)
  },
  details: (id: string) => apiFetch<Manga>(mangaPath(id)),
  chapters: (id: string, offset: number) => apiFetch<ChapterPage>(`${mangaPath(id)}/chapters?offset=${offset}`),
  refresh: (id: string) => apiFetch<ChapterPage>(`${mangaPath(id)}/chapters/refresh`, jsonPost()),
  library: (offset: number) => apiFetch<MangaPage>(`/manga/library?offset=${offset}`),
  setLibrary: (id: string, inLibrary: boolean) => apiFetch<Manga>(`${mangaPath(id)}/library`, jsonPost({ inLibrary })),
  subscribe: (id: string, subscribed: boolean) => apiFetch<Manga>(`${mangaPath(id)}/subscribe`, jsonPost({ subscribed })),
  tasks: () => apiFetch<{ queue: MangaTask[] }>('/manga/downloads'),
  download: (mangaId: string, chapterIds: string[]) => apiFetch<DownloadResult>('/manga/downloads', jsonPost({ mangaId, chapterIds })),
}

export const mangaApi: typeof liveMangaApi = IS_LIVE ? liveMangaApi : mangaMock

export async function loadMangaCover(id: string, signal: AbortSignal) {
  const token = getApiToken()
  const headers = token ? { 'x-ln-token': token } : undefined
  const response = await fetch(`${API_BASE}${mangaPath(id)}/cover`, { headers, signal, redirect: 'error' })
  if (!response.ok) throw new Error('漫画封面不可用')
  return response.blob()
}

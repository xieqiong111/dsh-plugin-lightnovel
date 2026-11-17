import { IS_LIVE, apiFetch } from '@/services/runtime'
import type { CoverTheme } from '@/types'

export interface KomgaLibrary {
  id: string
  name: string
}

export interface KomgaSeries {
  id: string
  libraryId: string
  title: string
  summary: string | null
  booksCount: number
  booksReadCount: number
  mockCover?: CoverTheme
}

interface SeriesPage {
  content: KomgaSeries[]
  page: { number: number; size: number; totalElements: number; totalPages: number; first: boolean; last: boolean }
}

const size = 24
const demoLibraries: KomgaLibrary[] = [
  { id: 'demo-manga', name: '演示漫画库' },
  { id: 'demo-comics', name: '演示图像小说库' },
]
const demoSeries: KomgaSeries[] = [
  { id: 'demo-001', libraryId: 'demo-manga', title: '海边邮局', summary: '海风停下的时候，邮局只为岛上最后一班船开门。', booksCount: 4, booksReadCount: 2, mockCover: 'mountain' },
  { id: 'demo-002', libraryId: 'demo-manga', title: '暮色书店', summary: '一间夜间营业的书店和它的三个常客。', booksCount: 2, booksReadCount: 0, mockCover: 'night' },
  { id: 'demo-003', libraryId: 'demo-comics', title: '去山那边', summary: '一趟沿着旧铁路展开的旅行。', booksCount: 1, booksReadCount: 1, mockCover: 'paper' },
]

export const komgaApi = {
  async libraries(): Promise<{ libraries: KomgaLibrary[] }> {
    return IS_LIVE ? apiFetch('/komga/libraries') : { libraries: demoLibraries }
  },

  async series(libraryId: string, query: string, page: number): Promise<SeriesPage> {
    if (IS_LIVE) {
      const params = new URLSearchParams({ libraryId, query, page: String(page), size: String(size) })
      return apiFetch(`/komga/series?${params}`)
    }
    const title = query.trim().toLocaleLowerCase()
    const filtered = demoSeries.filter((item) => item.libraryId === libraryId && item.title.toLocaleLowerCase().includes(title))
    const totalPages = Math.ceil(filtered.length / size)
    return {
      content: filtered.slice(page * size, (page + 1) * size),
      page: { number: page, size, totalElements: filtered.length, totalPages, first: page === 0, last: page + 1 >= totalPages },
    }
  },
}

export function komgaCoverPath(id: string) {
  return `/komga/series/${encodeURIComponent(id)}/thumbnail`
}

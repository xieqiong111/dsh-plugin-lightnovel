import type { Manga, MangaChapter, MangaSource, MangaTask } from '@/types/manga'

const sources: MangaSource[] = [
  { id: '100', name: '演示漫画源 · 简中', lang: 'zh' },
  { id: '200', name: '演示漫画源 · 繁中', lang: 'zh-TW' },
]

const mockTitles = [
  {
    id: '101', title: '星港邮差', aliases: ['星港郵差', '星际信使', '星際信使'],
    author: '林渡', description: '最后一班星际邮船驶离地球。年轻的邮差接下一封没有地址的信，踏上从未出现在航图里的航线。',
    source: sources[0], mockCover: 'night', status: 'ONGOING', inLibrary: true,
  },
  {
    id: '102', title: '山海图书馆', aliases: ['山海圖書館', '山海藏书阁', '山海藏書閣'],
    author: '许墨', description: '雨后的小镇出现了一座图书馆，书脊上的每一座山都能走进去。管理员用一枚铜制书签封存着它的秘密。',
    source: sources[0], mockCover: 'mountain', status: 'COMPLETED', inLibrary: false,
  },
  {
    id: '103', title: '星港郵差', aliases: ['星港邮差', '星际信使', '星際信使'],
    author: '林渡', description: '繁体版保留独立的章节目录和书架记录。邮差和乘客在星港交换彼此藏了多年的信。',
    source: sources[1], mockCover: 'city', status: 'ONGOING', inLibrary: false,
  },
  {
    id: '104', title: '月下的茶馆', aliases: ['月下的茶館'],
    author: '苏弦', description: '一家只在月出后营业的茶馆，专为旅途中的人亮起灯。今晚的客人忘记了自己的来处。',
    source: sources[0], mockCover: 'moon', status: 'ONGOING', inLibrary: true,
  },
] as const

const mangas = new Map<string, Manga>(mockTitles.map((entry) => [entry.id, {
  id: entry.id,
  title: entry.title,
  author: entry.author,
  artist: null,
  description: entry.description,
  genre: [],
  thumbnailUrl: null,
  sourceId: entry.source.id,
  source: entry.source,
  url: null,
  status: entry.status,
  inLibrary: entry.inLibrary,
  subscribed: entry.inLibrary,
  chapterCount: 5,
  downloadCount: 1,
  updatedAt: '2026-11-12T09:00:00+08:00',
  addedAt: entry.inLibrary ? '2026-11-12T01:00:00.000Z' : null,
  mockCover: entry.mockCover,
}]))

const queue = new Map<string, MangaTask>()

function getManga(id: string) {
  const manga = mangas.get(id)
  if (!manga) throw new Error('该演示漫画不存在。')
  return manga
}

function getChapters(id: string): MangaChapter[] {
  getManga(id)
  return ['起航', '无地址的信', '回声', '守夜人', '序章'].map((title, index) => ({
    id: `${id}${5 - index}`,
    name: `第 ${5 - index} 话 · ${title}`,
    uploadDate: `2026-11-${String(12 - index).padStart(2, '0')}T09:00:00+08:00`,
    read: index > 2,
    downloaded: index === 4,
    pageCount: 23,
  }))
}

async function setMembership(id: string, inLibrary: boolean) {
  const manga = getManga(id)
  const next = {
    ...manga,
    inLibrary,
    subscribed: inLibrary,
    addedAt: inLibrary ? manga.addedAt ?? new Date().toISOString() : null,
  }
  mangas.set(id, next)
  return next
}

export const mangaMock = {
  async sources() { return { sources } },
  async health() {
    return { reachable: true, authenticated: true, compatible: true, installedSources: sources.length, chapters: true, version: '演示数据' }
  },
  async search(query: string, sourceId: string, page: number) {
    const q = query.trim().toLocaleLowerCase()
    const matches = mockTitles.filter((entry) =>
      (!sourceId || entry.source.id === sourceId) &&
      [entry.title, ...entry.aliases].some((title) => title.toLocaleLowerCase().includes(q)),
    )
    return { mangas: page === 1 ? matches.map((entry) => getManga(entry.id)) : [], hasNextPage: false, errors: [] }
  },
  async details(id: string) { return getManga(id) },
  async chapters(id: string, offset: number) {
    return { chapters: getChapters(id).slice(offset), hasNextPage: false }
  },
  async refresh(id: string) {
    return { chapters: getChapters(id), hasNextPage: false }
  },
  async library(offset: number) {
    return { mangas: [...mangas.values()].filter((manga) => manga.inLibrary).slice(offset), hasNextPage: false }
  },
  setLibrary: setMembership,
  subscribe: setMembership,
  async tasks() { return { queue: [...queue.values()] } },
  async download(mangaId: string, chapterIds: string[]) {
    const manga = getManga(mangaId)
    const chapters = getChapters(mangaId)
    const queued: string[] = []
    const skipped: string[] = []
    for (const id of new Set(chapterIds)) {
      const chapter = chapters.find((item) => item.id === id)
      if (!chapter) throw new Error('章节不属于当前漫画。')
      if (chapter.downloaded || queue.has(id)) {
        skipped.push(id)
        continue
      }
      queue.set(id, {
        id, mangaId, title: manga.title, chapterId: id, chapterName: chapter.name,
        state: 'queued', upstreamState: 'DEMO', percent: null,
      })
      queued.push(id)
    }
    return { queued, skipped }
  },
}

/** Small in-memory Suwayomi GraphQL fake for BFF/client tests. */
export function createSuwayomiMock(options = {}) {
  const sources = options.sources ?? [
    { id: '0', name: 'Local source', displayName: 'Local', lang: 'localsourcelang' },
    { id: '10', name: '简体源', displayName: '简体漫画', lang: 'zh' },
    { id: '20', name: '繁體源', displayName: '繁體漫畫', lang: 'zh-TW' },
  ]
  const mangaRows = options.mangas ?? [
    {
      id: '1', title: '星港邮差', author: '林渡', artist: null, description: 'A synthetic fixture.', genre: ['科幻'],
      sourceId: '10', status: 'ONGOING', inLibrary: false, initialized: true, downloadCount: 0,
      realUrl: 'https://reader.example/manga/1', latestUploadDate: '1762909200000', thumbnailUrl: '/api/v1/manga/1/thumbnail',
    },
  ]
  const mangaById = new Map(mangaRows.map((item) => [String(item.id), item]))
  const chapterRows = options.chapters ?? [
    { id: '101', mangaId: '1', name: '第 1 话', uploadDate: '1762909200000', pageCount: 8, isRead: false, isDownloaded: false, sourceOrder: 1 },
    { id: '102', mangaId: '1', name: '第 2 话', uploadDate: '1762995600000', pageCount: 9, isRead: true, isDownloaded: false, sourceOrder: 2 },
  ]
  const chapters = new Map(chapterRows.map((item) => [String(item.id), item]))
  const queue = new Map()
  const calls = []
  let refreshCount = 0
  let enqueueCount = 0

  const sourceById = (id) => sources.find((item) => String(item.id) === String(id)) ?? null
  const mangaShape = (item) => ({
    id: String(item.id), title: item.title, author: item.author ?? null, artist: item.artist ?? null,
    description: item.description ?? null, genre: item.genre ?? [], status: item.status ?? 'UNKNOWN',
    thumbnailUrl: item.thumbnailUrl ?? null, sourceId: String(item.sourceId), url: item.url ?? null,
    realUrl: item.realUrl ?? null, initialized: item.initialized ?? true,
    inLibrary: item.inLibrary === true, inLibraryAt: item.inLibraryAt ?? null, downloadCount: item.downloadCount ?? 0,
    latestFetchedChapter: item.latestUploadDate ? { uploadDate: String(item.latestUploadDate) } : null,
    source: sourceById(item.sourceId),
  })
  const chapterShape = (item) => ({
    id: String(item.id), mangaId: String(item.mangaId), name: item.name, url: item.url ?? '',
    chapterNumber: item.chapterNumber ?? null, uploadDate: String(item.uploadDate ?? 0), pageCount: item.pageCount ?? -1,
    isRead: item.isRead === true, isBookmarked: item.isBookmarked === true, isDownloaded: item.isDownloaded === true,
    lastPageRead: item.lastPageRead ?? 0, lastReadAt: item.lastReadAt ?? 0,
  })
  const queueShape = () => ({
    state: 'STARTED',
    queue: [...queue.values()].map((item, index) => ({
      position: index,
      ...(options.missingQueueProgress ? {} : { progress: item.progress ?? 0 }),
      state: item.state ?? 'QUEUED',
      tries: 0,
      chapter: chapterShape(chapters.get(item.chapterId)),
      manga: { id: String(item.mangaId), title: mangaById.get(item.mangaId)?.title ?? '' },
    })),
  })

  async function fetchImpl(input, init = {}) {
    const url = String(input)
    calls.push({ url, init })
    if (init.redirect !== 'error') throw new Error('redirect policy missing')
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/thumbnail')) {
      return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { status: 200, headers: { 'content-type': 'image/png' } })
    }
    if (parsed.pathname !== '/api/graphql' || init.method !== 'POST') return new Response('not found', { status: 404 })
    if (options.authorization && init.headers?.authorization !== options.authorization) return new Response('unauthorized', { status: 401 })
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay))
    const body = JSON.parse(String(init.body ?? '{}'))
    const operation = /(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1]
    const variables = body.variables ?? {}
    let data

    switch (operation) {
      case 'MangaHealth':
        data = {
          aboutServer: { version: 'v2.4.2366' },
          sources: { nodes: sources.map((item) => ({ id: String(item.id) })), pageInfo: { hasNextPage: false } },
          chapters: { nodes: chapterRows.length ? [{ id: String(chapterRows[0].id), isRead: false, isDownloaded: false }] : [], totalCount: chapterRows.length },
        }
        break
      case 'MangaSources':
      {
        const rows = sources.slice(variables.offset, variables.offset + variables.first)
          .map((item) => options.nullSourceIds?.includes(String(item.id)) ? null : ({ ...item }))
        data = {
          sources: {
            nodes: options.omitNullSources ? rows.filter(Boolean) : rows,
            pageInfo: { hasNextPage: variables.offset + rows.length < sources.length },
            totalCount: sources.length,
          },
        }
        break
      }
      case 'MangaSourceById':
        data = { source: sourceById(variables.id) }
        break
      case 'SearchManga': {
        const input = variables.input
        const matches = options.search ? options.search(input, mangaRows) : mangaRows.filter((item) =>
          String(item.sourceId) === String(input.source) && String(item.title).toLocaleLowerCase().includes(String(input.query ?? '').toLocaleLowerCase()),
        )
        data = { fetchSourceManga: { mangas: matches.map(mangaShape), hasNextPage: false } }
        break
      }
      case 'MangaDetails': {
        const item = mangaById.get(String(variables.id))
        data = { manga: item ? mangaShape(item) : null, chapterCount: { totalCount: chapterRows.filter((c) => String(c.mangaId) === String(variables.id)).length } }
        break
      }
      case 'MangaCover': {
        const item = mangaById.get(String(variables.id))
        data = { manga: item ? { thumbnailUrl: item.thumbnailUrl ?? `/api/v1/manga/${item.id}/thumbnail` } : null }
        break
      }
      case 'MangaChapters': {
        const item = mangaById.get(String(variables.id))
        const ordered = chapterRows.filter((c) => String(c.mangaId) === String(variables.id)).sort((a, b) => (b.sourceOrder ?? 0) - (a.sourceOrder ?? 0))
        const nodes = ordered.slice(variables.offset, variables.offset + variables.first).map(chapterShape)
        data = {
          manga: item ? { id: String(item.id), initialized: item.initialized ?? true } : null,
          chapters: { nodes, totalCount: ordered.length, pageInfo: { hasNextPage: variables.offset + nodes.length < ordered.length } },
        }
        break
      }
      case 'CountMangaChapters':
        data = Object.fromEntries(Object.entries(variables).map(([key, id], index) => [
          `count${index}`, { totalCount: chapterRows.filter((c) => String(c.mangaId) === String(id)).length },
        ]))
        break
      case 'MangaLibrary': {
        const rows = mangaRows.filter((item) => item.inLibrary === true)
        const nodes = rows.slice(variables.offset, variables.offset + variables.first).map(mangaShape)
        data = { mangas: { nodes, totalCount: rows.length, pageInfo: { hasNextPage: variables.offset + nodes.length < rows.length } } }
        break
      }
      case 'MangaDownloadQueue':
        data = { downloadStatus: queueShape() }
        break
      case 'ValidateMangaChapters': {
        data = {}
        for (const match of body.query.matchAll(/(chapter\d+): chapter\(id: \$(id\d+)\)/g)) {
          const [, alias, variable] = match
          const id = variables[variable]
          const item = chapters.get(String(id))
          data[alias] = item ? { id: String(item.id), mangaId: String(item.mangaId), isDownloaded: item.isDownloaded === true } : null
        }
        break
      }
      case 'EnqueueMangaDownloads':
        enqueueCount++
        for (const id of variables.ids) {
          const item = chapters.get(String(id))
          if (item && !options.hideEnqueuedEvidence && !options.completeImmediately) {
            queue.set(String(id), { chapterId: String(id), mangaId: String(item.mangaId), state: options.enqueueFinished ? 'FINISHED' : 'QUEUED' })
          }
          if (item && options.completeImmediately) item.isDownloaded = true
        }
        data = { enqueueChapterDownloads: { downloadStatus: queueShape() } }
        break
      case 'CancelMangaDownloads':
        for (const id of variables.ids) queue.delete(String(id))
        data = { dequeueChapterDownloads: { downloadStatus: queueShape() } }
        break
      case 'SetMangaLibrary': {
        const item = mangaById.get(String(variables.id))
        if (item) item.inLibrary = variables.inLibrary
        data = { updateManga: { manga: item ? mangaShape(item) : null } }
        break
      }
      case 'RefreshMangaChapters': {
        refreshCount++
        const item = mangaById.get(String(variables.input.id))
        if (item) item.initialized = true
        data = { fetchMangaAndChapters: { manga: item ? { id: String(item.id) } : null, chapters: chapterRows.filter((c) => String(c.mangaId) === String(variables.input.id)).map((c) => ({ id: String(c.id) })) } }
        break
      }
      case 'RefreshMangaLibrary':
        data = { updateLibrary: { updateStatus: { __typename: 'LibraryUpdateStatus' } } }
        break
      default:
        return new Response(JSON.stringify({ errors: [{ message: `Unexpected operation ${operation}` }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  return {
    fetch: fetchImpl,
    calls,
    sources,
    mangas: mangaRows,
    chapters,
    queue,
    get refreshCount() { return refreshCount },
    get enqueueCount() { return enqueueCount },
  }
}

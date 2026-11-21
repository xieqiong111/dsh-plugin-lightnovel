/** Exercise the manga tools through the real DSH validator/executor without a Suwayomi write. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import type { PluginRuntime } from '../../src/runtime.js'
import { registerMangaTools } from '../../src/tools/manga.js'
import type { MangaKomga } from '../../server/manga-komga.mjs'

const manga = {
  sources: vi.fn(async () => ({ sources: [{ id: 'source-1', name: 'Example', lang: 'en' }], totalCount: 1, hasNextPage: false })),
  searchManga: vi.fn(async (args: unknown) => ({ items: [{ id: 'manga-1' }], totalCount: 1, args })),
  getManga: vi.fn(async (id: string) => ({ id, title: 'Example Manga' })),
  getChapters: vi.fn(async (id: string, page: unknown) => ({ mangaId: id, items: [{ id: 'chapter-1' }], page })),
  download: vi.fn(async (args: unknown) => ({ queued: ['chapter-1'], unconfirmed: [] as string[], args })),
  tasks: vi.fn(async (args: unknown) => ({ queue: [{ chapterId: 'chapter-1' }], args })),
  library: vi.fn(async (args: unknown) => ({ items: [{ id: 'manga-1' }], args })),
  setLibrary: vi.fn(async (args: unknown) => ({ id: 'manga-1', inLibrary: true, args })),
}

const runtime = {
  ready: vi.fn(async () => {}),
  suwayomi: manga,
  logger: { warn: vi.fn() },
} as unknown as PluginRuntime

const komga = {
  status: vi.fn(async () => ({ available: true, volumes: [{ number: 2, state: 'downloading', tasks: [{ percent: 61 }] }] })),
  download: vi.fn(async () => ({ queued: ['41'], skipped: [], completed: [], filename: null })),
}

let ctx: Context
let sequence = 0

async function call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const batch = await ctx.tools.execute({
    calls: [{
      type: 'tool-call',
      id: `manga_${++sequence}`,
      name,
      arguments: JSON.stringify(args),
    }],
    signal: new AbortController().signal,
  })
  const result = batch.results[0]?.result as { isError?: boolean; value?: unknown; content?: unknown } | undefined
  if (!result) throw new Error(`DSH returned no result for ${name}`)
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`)
  return result.value as Record<string, unknown>
}

beforeAll(async () => {
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  registerMangaTools(ctx, runtime, komga as unknown as MangaKomga)
})

afterAll(async () => { await ctx?.dispose?.() })

describe('native manga tools', () => {
  it('registers independent tools with DSH output schemas', () => {
    const names = [
      'manga_search', 'manga_details', 'manga_chapters', 'manga_download',
      'manga_tasks', 'manga_library', 'manga_sources', 'manga_subscribe',
      'manga_komga_status', 'manga_komga_download',
    ]
    const schemas = ctx.tools.schemas()
    for (const name of names) {
      expect(schemas.map((tool) => tool.name)).toContain(name)
      const definition = ctx.tools.get(name)
      expect(definition?.output.schema, name).toBeTruthy()
      expect(typeof definition?.execute, name).toBe('function')
    }
  })

  it('dispatches structured calls to the shared Suwayomi client', async () => {
    expect((await call('manga_search', { query: 'title', page: 2, offset: 20, resultId: 'fixture-result', limit: 5 })).ok).toBe(true)
    expect(manga.searchManga).toHaveBeenCalledWith({
      query: 'title', sourceId: undefined, type: 'SEARCH', page: 2, offset: 20, resultId: 'fixture-result', limit: 5,
    })

    expect((await call('manga_details', { mangaId: 'manga-1' })).ok).toBe(true)
    expect(manga.getManga).toHaveBeenCalledWith('manga-1')

    expect((await call('manga_chapters', { mangaId: 'manga-1', limit: 10, offset: 20 })).ok).toBe(true)
    expect(manga.getChapters).toHaveBeenCalledWith('manga-1', { limit: 10, offset: 20 })

    expect((await call('manga_download', { mangaId: 'manga-1', chapterIds: ['chapter-1', 'chapter-1'] })).ok).toBe(true)
    expect(manga.download).toHaveBeenCalledWith({ mangaId: 'manga-1', chapterIds: ['chapter-1'] })

    expect((await call('manga_tasks', { action: 'cancel', chapterIds: ['chapter-1'] })).ok).toBe(true)
    expect(manga.tasks).toHaveBeenCalledWith({ action: 'cancel', chapterIds: ['chapter-1'] })

    expect((await call('manga_library', { limit: 25, offset: 5 })).ok).toBe(true)
    expect(manga.library).toHaveBeenCalledWith({ limit: 25, offset: 5 })

    expect((await call('manga_sources')).ok).toBe(true)
    expect(manga.sources).toHaveBeenCalledOnce()

    expect((await call('manga_subscribe', { mangaId: 'manga-1', inLibrary: true })).ok).toBe(true)
    expect(manga.setLibrary).toHaveBeenCalledWith({ mangaId: 'manga-1', inLibrary: true })
  })

  it('dispatches Komga volume status and download through native DSH tools', async () => {
    expect(await call('manga_komga_status', { mangaId: '22', volume: 2 })).toMatchObject({
      ok: true, volumes: [{ number: 2, state: 'downloading', tasks: [{ percent: 61 }] }],
    })
    expect(komga.status).toHaveBeenCalledWith('22', 2)
    expect(await call('manga_komga_download', { mangaId: '22', volume: 2 })).toMatchObject({
      ok: true, queued: ['41'], filename: null,
    })
    expect(komga.download).toHaveBeenCalledWith('22', 2)
  })

  it('reports an unconfirmed enqueue as unresolved without requesting an automatic retry', async () => {
    manga.download.mockResolvedValueOnce({ queued: [], unconfirmed: ['chapter-1'], args: null })
    const result = await call('manga_download', { mangaId: 'manga-1', chapterIds: ['chapter-1'] })
    expect(result).toMatchObject({
      ok: false,
      unconfirmed: ['chapter-1'],
      error: { code: 'MANGA_DOWNLOAD_UNCONFIRMED', retryable: false },
    })
  })

  it('rejects unsupported actions and empty required selections without calling Suwayomi', async () => {
    const beforeCalls = manga.download.mock.calls.length
    const download = await call('manga_download', { mangaId: 'manga-1', chapterIds: [] })
    expect(download.ok).toBe(false)
    expect((await call('manga_tasks', { action: 'pause' })).ok).toBe(false)
    expect(manga.download).toHaveBeenCalledTimes(beforeCalls)
  })
})

import type { ResolvedConfig } from '../config.js'
import type { DartBridge } from './bridge.js'
import type { LocalIndex } from '../sources/local-index.js'
import type { SourceRegistry } from '../sources/registry.js'
import { resolveBook } from '../search.js'
import { normalizeStatus } from '../sources/types.js'
import type { BookRecord, ChapterInfo, NovelDetail, VolumeDetail, VolumeSummary } from '../types.js'
import type { Logger } from '../util/logger.js'

interface DartNovel {
  id?: string
  title?: string
  alias?: string | null
  author?: string
  status?: string
  coverUrl?: string | null
  tags?: string[]
  publisher?: string | null
  description?: string | null
  url?: string
  sourceId?: string
  source?: string
}

interface DartVolume {
  index?: number
  name?: string
  cover?: string | null
  chapterCount?: number
  chapters?: Array<{ name?: string; url?: string | null }>
}

export interface DetailsResult {
  novel: NovelDetail
  raw: Record<string, unknown>
}

export interface VolumesResult {
  novel: NovelDetail
  volumes: VolumeDetail[]
  totalVolumes: number
  totalChapters: number
}

export interface BookReference {
  bookId?: string
  url?: string
  source?: string
}

/** Details/volume reads reuse the vendored Dart scrapers through the bridge. */
export class NovelService {
  constructor(
    private readonly config: ResolvedConfig,
    private readonly bridge: DartBridge,
    private readonly index: LocalIndex,
    private readonly registry: SourceRegistry,
    private readonly logger: Logger,
  ) {}

  async details(reference: BookReference, includeVolumes = false): Promise<DetailsResult> {
    const { book, adapter } = resolveBook(this.index, this.registry, reference)
    const command = includeVolumes ? 'volumes' : 'details'
    const result = await this.bridge.run<{ novel?: DartNovel; volumes?: DartVolume[] }>({
      command,
      url: book.sourceUrl,
      sourceId: adapter.info.id,
      allowedSources: this.registry.dartAllowedSources(this.config),
      timeoutMs: this.config.searchTimeoutMs,
    })
    const raw = result.data
    const merged = this.mergeBook(book, raw.novel, adapter.info.id, adapter.info.name)
    const volumes = toVolumeSummaries(raw.volumes ?? [])
    await this.index.upsert({
      ...merged,
      volumeCount: raw.volumes ? volumes.length : merged.volumeCount,
    })
    const detail: NovelDetail = {
      ...merged,
      volumeCount: volumes.length,
      chapterCount: volumes.reduce((sum, v) => sum + v.chapterCount, 0),
      volumes,
    }
    this.logger.info('novel', 'details', { bookId: merged.id, volumes: volumes.length, command })
    return { novel: detail, raw }
  }

  async volumes(reference: BookReference): Promise<VolumesResult> {
    const { book, adapter } = resolveBook(this.index, this.registry, reference)
    const result = await this.bridge.run<{ novel?: DartNovel; volumes?: DartVolume[] }>({
      command: 'volumes',
      url: book.sourceUrl,
      sourceId: adapter.info.id,
      allowedSources: this.registry.dartAllowedSources(this.config),
      timeoutMs: this.config.searchTimeoutMs * 2,
    })
    const merged = this.mergeBook(book, result.data.novel, adapter.info.id, adapter.info.name)
    const volumes: VolumeDetail[] = (result.data.volumes ?? []).map((v, i) => {
      const chapters: ChapterInfo[] = (v.chapters ?? []).map((c) => ({
        name: String(c.name ?? `Chapter ${i + 1}`),
        url: c.url ?? null,
      }))
      return {
        index: v.index ?? i + 1,
        name: String(v.name ?? ''),
        cover: v.cover ?? null,
        chapterCount: v.chapterCount ?? chapters.length,
        chapters,
      }
    })
    await this.index.upsert({ ...merged, volumeCount: volumes.length })
    const totalChapters = volumes.reduce((sum, v) => sum + v.chapterCount, 0)
    this.logger.info('novel', 'volumes', { bookId: merged.id, volumes: volumes.length, chapters: totalChapters })
    return {
      novel: { ...merged, volumeCount: volumes.length, chapterCount: totalChapters, volumes: volumes.map(toSummary) },
      volumes,
      totalVolumes: volumes.length,
      totalChapters,
    }
  }

  private mergeBook(base: BookRecord, raw: DartNovel | undefined, sourceId: string, sourceName: string): BookRecord {
    if (!raw) return base
    const statusText = String(raw.status ?? base.statusText)
    return {
      ...base,
      id: `${sourceId}:${raw.id ?? base.bookId}`,
      bookId: String(raw.id ?? base.bookId),
      sourceId,
      source: sourceName || raw.source || base.source,
      sourceUrl: raw.url ?? base.sourceUrl,
      title: String(raw.title ?? base.title),
      aliases: [...new Set([...base.aliases, ...(raw.alias ? [raw.alias] : [])])],
      author: String(raw.author ?? base.author),
      coverUrl: raw.coverUrl ?? base.coverUrl,
      description: raw.description ?? base.description,
      tags: raw.tags ?? base.tags,
      publisher: raw.publisher ?? base.publisher,
      statusText,
      status: normalizeStatus(statusText),
      indexedAt: new Date().toISOString(),
    }
  }
}

function toVolumeSummaries(volumes: DartVolume[]): VolumeSummary[] {
  return volumes.map((v, i) => ({
    index: v.index ?? i + 1,
    name: String(v.name ?? ''),
    cover: v.cover ?? null,
    chapterCount: v.chapterCount ?? v.chapters?.length ?? 0,
  }))
}

function toSummary(v: VolumeDetail): VolumeSummary {
  return { index: v.index, name: v.name, cover: v.cover, chapterCount: v.chapterCount }
}

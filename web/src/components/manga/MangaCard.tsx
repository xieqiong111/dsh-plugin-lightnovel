import { Link } from 'react-router-dom'
import { Badge, Card } from '@/components/common/ui'
import { CoverArt } from '@/components/novel/CoverArt'
import { ApiCover } from '@/components/common/ApiCover'
import { IS_LIVE } from '@/services/runtime'
import type { Manga } from '@/types/manga'

const statuses: Record<string, string> = {
  ONGOING: '连载中',
  COMPLETED: '已完结',
  LICENSED: '已授权',
  PUBLISHING_FINISHED: '已出版完毕',
  CANCELLED: '已取消',
  ON_HIATUS: '休刊',
  UNKNOWN: '状态未知',
}

export function mangaStatus(status: string) {
  return statuses[status.toUpperCase()] ?? '状态未知'
}

export function mangaSource(manga: Manga) {
  return manga.source?.name ?? manga.sourceId
}

export function mangaDate(value: string | number | null) {
  if (!value) return '未知'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleDateString('zh-CN')
}

export function MangaCover({ manga, className, eager = false }: { manga: Manga; className?: string; eager?: boolean }) {
  if (manga.mockCover && !IS_LIVE) {
    return <CoverArt theme={manga.mockCover} index={0} title={manga.title} media="manga" className={className} />
  }

  const coverPath = IS_LIVE && manga.thumbnailUrl ? `/manga/${encodeURIComponent(manga.id)}/cover` : null
  return <ApiCover path={coverPath} title={manga.title} className={className} eager={eager} />
}

function sourceWebsite(manga: Manga) {
  if (!manga.url) return ''
  try {
    const url = new URL(manga.url)
    return ['http:', 'https:'].includes(url.protocol) ? url.hostname : ''
  } catch {
    return ''
  }
}

export function MangaCard({ manga, library = false }: { manga: Manga; library?: boolean }) {
  return (
    <Card hoverable className="flex min-w-0 flex-col overflow-hidden p-[6px]" data-media-type="manga" data-resource-id={manga.id}>
      <Link to={`/manga/${encodeURIComponent(manga.id)}`} className="flex h-full min-w-0 flex-col rounded-[11px] focus-visible:outline-violet-400">
        <MangaCover manga={manga} className="aspect-[3/4] w-full rounded-[11px]" />
        <div className="flex flex-1 flex-col space-y-1.5 px-2 pb-2 pt-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 flex-[1_1_7rem] break-words text-[13px] font-bold leading-snug text-ink" title={manga.title}>{manga.title}</h3>
            <Badge className="shrink-0">漫画</Badge>
          </div>
          <p className="truncate text-[11px] text-ink-soft">{mangaSource(manga)} · {mangaStatus(manga.status)}</p>
          {library ? (
            <>
            <p className="break-words text-[10px] leading-relaxed text-ink-soft">
              Suwayomi 章节 · {manga.downloadCount === null ? '下载状态未知' : `已下载 ${manga.downloadCount}${manga.chapterCount === null ? '' : `/${manga.chapterCount}`} 章`}
              <br />更新 {mangaDate(manga.updatedAt)} · ID {manga.id}
            </p>
            <span className="mt-auto block pt-2"><span className="flex h-8 items-center justify-center rounded-full bg-accent-soft text-[11px] font-medium text-accent">漫画详情</span></span>
            </>
          ) : (
            <>
              <p className="truncate text-[11px] text-ink-soft">
                {[manga.author || '作者未知', sourceWebsite(manga)].filter(Boolean).join(' · ')}
              </p>
              <p className="line-clamp-2 text-[11px] leading-relaxed text-ink-soft">{manga.description || '暂无简介'}</p>
            </>
          )}
        </div>
      </Link>
    </Card>
  )
}

import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card } from '@/components/common/ui'
import { CoverArt } from '@/components/novel/CoverArt'
import { loadMangaCover } from '@/services/mangaApi'
import { IS_LIVE } from '@/services/runtime'
import { cn } from '@/services/utils'
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
  const [image, setImage] = useState<string>()
  const [visible, setVisible] = useState(eager)
  const [element, setElement] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!element || visible) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true)
    }, { rootMargin: '160px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, visible])

  useEffect(() => {
    if (!IS_LIVE || !manga.thumbnailUrl || !visible) return
    const controller = new AbortController()
    let url: string | undefined
    setImage(undefined)
    void loadMangaCover(manga.id, controller.signal).then((blob) => {
      if (controller.signal.aborted) return
      url = URL.createObjectURL(blob)
      setImage(url)
    }).catch(() => {})
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [manga.id, manga.thumbnailUrl, visible])

  if (manga.mockCover && !IS_LIVE) {
    return <CoverArt theme={manga.mockCover} index={0} title={manga.title} media="manga" className={className} />
  }

  return (
    <div ref={setElement} className={cn('relative grid place-items-center overflow-hidden bg-[#F1EDFE] text-[#A78BFA]', className)}>
      {image ? (
        <img src={image} alt={`${manga.title} 封面`} className="absolute inset-0 h-full w-full object-cover" onError={() => setImage(undefined)} />
      ) : (
        <BookOpen className="h-[20%] w-[20%]" aria-label="暂无封面" />
      )}
    </div>
  )
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
    <Card hoverable className="min-w-0 overflow-hidden p-[6px]" data-media-type="manga" data-resource-id={manga.id}>
      <Link to={`/manga/${encodeURIComponent(manga.id)}`} className="block rounded-[11px] focus-visible:outline-violet-400">
        <MangaCover manga={manga} className="aspect-[3/4] w-full rounded-[11px]" />
        <div className="space-y-1.5 px-2 pb-2 pt-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 truncate text-[13px] font-bold text-[#2B2C44]" title={manga.title}>{manga.title}</h3>
            <Badge>漫画</Badge>
          </div>
          <p className="truncate text-[11px] text-[#6B6B85]">{mangaSource(manga)} · {mangaStatus(manga.status)}</p>
          {library ? (
            <p className="text-[10px] leading-relaxed text-[#6B6B85]">
              Suwayomi 章节 · {manga.downloadCount === null ? '下载状态未知' : `已下载 ${manga.downloadCount}${manga.chapterCount === null ? '' : `/${manga.chapterCount}`} 章`}
              <br />更新 {mangaDate(manga.updatedAt)} · ID {manga.id}
            </p>
          ) : (
            <>
              <p className="truncate text-[11px] text-[#6B6B85]">
                {[manga.author || '作者未知', sourceWebsite(manga)].filter(Boolean).join(' · ')}
              </p>
              <p className="line-clamp-2 text-[11px] leading-relaxed text-[#8B8BA0]">{manga.description || '暂无简介'}</p>
            </>
          )}
        </div>
      </Link>
    </Card>
  )
}

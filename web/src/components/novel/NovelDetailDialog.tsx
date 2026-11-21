import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Download, Star } from 'lucide-react'
import { Button, Badge } from '@/components/common/ui'
import { Modal } from '@/components/common/Modal'
import { CoverArt } from '@/components/novel/CoverArt'
import { VolumeSelector } from '@/components/novel/VolumeSelector'
import { useToast } from '@/components/common/Toast'
import { novelApi } from '@/services/novelApi'
import { IS_LIVE } from '@/services/runtime'
import type { Novel, Volume } from '@/types'

export function NovelDetailDialog({
  novel,
  onClose,
  onDownloaded,
}: {
  novel: Novel | null
  onClose: () => void
  onDownloaded?: (title: string) => void
}) {
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!novel) return
    let alive = true
    novelApi.getVolumes(novel.id).then((list) => {
      if (!alive) return
      setVolumes(list)
      setSelected([list[0]?.id].filter(Boolean) as string[])
    })
    return () => {
      alive = false
    }
  }, [novel])

  if (!novel) return null

  const quickDownload = async () => {
    if (selected.length === 0 || submitting) return
    setSubmitting(true)
    try {
      await novelApi.createTask({
        bookId: novel.id,
        volumes: selected,
        volumeNames: volumes.filter((v) => selected.includes(v.id)).map((v) => v.name),
        combine: false,
        addChapterTitle: true,
      })
      onDownloaded?.(novel.title)
      onClose()
    } catch (error) {
      toast({
        tone: 'warning',
        title: '创建下载任务失败',
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={Boolean(novel)} onClose={onClose} width="max-w-[720px]">
      <div className="grid gap-5 p-6 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div>
          <CoverArt
            theme={novel.cover}
            index={novel.coverIndex}
            title={novel.title}
            caption={novel.source}
            className="aspect-[3/4] w-full rounded-[14px] shadow-[0_18px_40px_-20px_rgba(43,42,85,0.6)]"
          />
          <div className="mt-3 flex items-center justify-between rounded-[10px] bg-surface-soft px-3 py-2 text-[10.5px] text-ink-soft">
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 text-caution" />
              {novel.rating > 0 ? novel.rating.toFixed(1) : '暂无评分'}
            </span>
            <span>{novel.volumes} 卷</span>
            <span>{novel.status === 'completed' ? '完结' : '连载'}</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={novel.status === 'completed' ? 'green' : 'violet'}>
              {novel.status === 'completed' ? '已完结' : '连载中'}
            </Badge>
            <Badge tone="gray">{novel.source}</Badge>
            <Badge tone={IS_LIVE ? 'green' : 'amber'}>{IS_LIVE ? '实时数据' : '示例数据'}</Badge>
          </div>
          <h2 className="mt-3 text-[21px] font-bold leading-tight tracking-[-0.01em] text-ink">{novel.title}</h2>
          <p className="mt-1 text-[11.5px] text-ink-soft">
            {novel.author} · 最近更新 {novel.updatedAt}
          </p>
          <p className="mt-3 line-clamp-4 text-[11.5px] leading-[1.85] text-ink-soft">{novel.summary}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {novel.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] text-accent">
                #{tag}
              </span>
            ))}
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <VolumeSelector volumes={volumes} selected={selected} onChange={setSelected} />
            {volumes.length === 0 && (
              <p className="mt-3 rounded-[10px] bg-caution-soft px-3 py-2 text-[10px] leading-relaxed text-caution">
                {IS_LIVE
                  ? '后端未返回分卷：请检查 Dart headless 核心是否可用，或该书源是否提供卷目录。'
                  : '暂无分卷数据。'}
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="md"
              icon={<Download className="h-3.5 w-3.5" />}
              disabled={submitting || selected.length === 0}
              onClick={() => void quickDownload()}
            >
              {submitting ? '正在创建…' : `下载 ${selected.length} 卷`}
            </Button>
            <Link
              to={`/novel/${encodeURIComponent(novel.id)}`}
              onClick={onClose}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-5 text-[12px] font-medium text-ink-soft transition hover:border-accent-line hover:text-accent"
            >
              <BookOpen className="h-3.5 w-3.5" />
              完整详情
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <span className="text-[10px] text-ink-muted">任务创建后会出现在「下载任务」</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Download,
  Info,
  Layers,
  Link2,
  Share2,
  Star,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, SectionTitle } from '@/components/common/ui'
import { PageHeader } from '@/components/common/PageHeader'
import { CoverArt } from '@/components/novel/CoverArt'
import { VolumeSelector } from '@/components/novel/VolumeSelector'
import { useToast } from '@/components/common/Toast'
import { novelApi } from '@/services/novelApi'
import { taskStore } from '@/services/taskStore'
import type { Novel, Volume } from '@/types'
import { cn } from '@/services/utils'

export function NovelDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [novel, setNovel] = useState<Novel | null>(null)
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [combine, setCombine] = useState(false)
  const [addChapterTitle, setAddChapterTitle] = useState(true)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([novelApi.getNovel(decodeURIComponent(id)), novelApi.getVolumes(decodeURIComponent(id))]).then(
      ([novelData, volumeData]) => {
        if (!alive) return
        if (!novelData) {
          setNotFound(true)
          setLoading(false)
          return
        }
        setNovel(novelData)
        setVolumes(volumeData)
        setSelected(volumeData[0] ? [volumeData[0].id] : [])
        setLoading(false)
      },
    )
    return () => {
      alive = false
    }
  }, [id])

  const selectedNames = useMemo(
    () => volumes.filter((volume) => selected.includes(volume.id)).map((volume) => volume.name),
    [selected, volumes],
  )

  const createTask = () => {
    if (!novel) return
    if (selected.length === 0) {
      toast({ tone: 'warning', title: '请至少选择一个分卷', description: '分卷是 EPUB 打包的最小单位。' })
      return
    }
    taskStore.create({
      bookId: novel.id,
      volumes: selected,
      volumeNames: selectedNames,
      combine,
      addChapterTitle,
    })
    toast({
      tone: 'success',
      title: `已创建下载任务：${novel.title}`,
      description: `${selectedNames.length} 卷 · ${combine ? '合并为单一 EPUB' : '每卷独立生成'}，可在任务页查看进度。`,
    })
    navigate('/tasks')
  }

  if (notFound) {
    return (
      <Card>
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title="未找到这本小说"
          description="该 ID 不在当前演示数据中。返回搜索页试试其他关键词。"
          action={
            <Link to="/search">
              <Button variant="primary" size="sm">
                返回搜索
              </Button>
            </Link>
          }
        />
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-[240px] w-full rounded-[22px]" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="skeleton h-[280px] w-full rounded-[20px]" />
          <div className="skeleton h-[320px] w-full rounded-[20px]" />
        </div>
      </div>
    )
  }

  if (!novel) return null

  return (
    <div>
      <PageHeader
        eyebrow="Novel detail"
        title={
          <span className="flex items-center gap-3">
            <Link
              to="/search"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#EFEDF6] bg-white text-[#8B8BA0] transition hover:text-[#6C4AD9]"
              aria-label="返回搜索"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            小说详情
          </span>
        }
        description="确认分卷与打包选项后创建异步下载任务。数据来自本地示例，下载不会写入真实书库。"
        actions={
          <>
            <Badge tone="amber">{novel.source} · 示例</Badge>
            <Button
              variant="secondary"
              size="sm"
              icon={<Share2 className="h-3.5 w-3.5" />}
              onClick={() => toast({ tone: 'info', title: '分享链接已复制（演示）', description: '真实环境将复制当前页面 URL。' })}
            >
              分享
            </Button>
          </>
        }
      />

      <Card className="relative overflow-hidden border-[#E9E4FA] bg-[linear-gradient(110deg,#F7F4FF,#F0ECFF_55%,#E6E0FD)] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full border border-white/60" />
        <div className="relative flex flex-col gap-6 sm:flex-row">
          <div className="w-[168px] shrink-0 self-center sm:self-start">
            <CoverArt
              theme={novel.cover}
              index={novel.coverIndex}
              title={novel.title}
              caption={novel.source}
              className="aspect-[3/4] w-full rounded-[14px] shadow-[0_22px_50px_-22px_rgba(43,42,85,0.65)] ring-1 ring-white/40"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={novel.status === 'completed' ? 'green' : 'violet'}>
                {novel.status === 'completed' ? '已完结' : '连载中'}
              </Badge>
              <Badge tone="gray">{novel.source}</Badge>
              <Badge tone="violet" className="bg-white/70">
                EPUB
              </Badge>
            </div>
            <h2 className="mt-3 text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#1E1F35]">{novel.title}</h2>
            <p className="mt-2 text-[12px] text-[#73738C]">
              {novel.author}
              <span className="mx-2 text-[#B5B5C6]">·</span>
              由 {novel.source} 提供
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10.5px] text-[#7A7A92]">
              <span className="flex items-center gap-1.5">
                <Star className="h-3 w-3 text-[#F59E0B]" />
                {novel.rating.toFixed(1)} 评分
              </span>
              <span className="flex items-center gap-1.5">
                <Layers className="h-3 w-3 text-[#A78BFA]" />
                共 {novel.volumes} 卷
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-[#A78BFA]" />
                更新于 {novel.updatedAt}
              </span>
              <span className="flex items-center gap-1.5">
                <Link2 className="h-3 w-3 text-[#A78BFA]" />
                {novel.id}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {novel.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-white/70 bg-white/60 px-2.5 py-1 text-[10px] text-[#7566AE] backdrop-blur-sm">
                  #{tag}
                </span>
              ))}
            </div>

            <p className="mt-4 max-w-[760px] text-[11.5px] leading-[1.9] text-[#6B6B85]">{novel.summary}</p>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-6">
          <SectionTitle title="分卷列表" right={<span className="text-[10.5px] text-[#A2A2B6]">共 {volumes.length} 卷</span>} />
          <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-[#9C9CB0]">
            <Info className="mt-[1px] h-3 w-3 shrink-0 text-[#C4B5FB]" />
            每卷将单独生成 EPUB，或在右侧开启合并后打包为单文件。
          </p>
          <div className="mt-4">
            <VolumeSelector volumes={volumes} selected={selected} onChange={setSelected} />
          </div>

          <div className="mt-5 rounded-[12px] border border-[#EFEDF6] bg-[#FBFAFE] p-4">
            <p className="text-[11px] font-semibold text-[#3F4058]">章节命名</p>
            <p className="mt-1 text-[10px] leading-relaxed text-[#A2A2B6]">
              开启「添加章节标题」后，生成的 EPUB 目录会保留原站章节序号与标题；关闭则仅保留正文。
            </p>
          </div>
        </Card>

        <div className="space-y-5 lg:sticky lg:top-[96px] lg:self-start">
          <Card className="p-5">
            <SectionTitle title="下载设置" className="[&_h2]:text-[17px]" />
            <div className="mt-4 space-y-3">
              <ToggleRow
                label="合并为单一 EPUB"
                description="多卷内容打包进一个文件"
                checked={combine}
                onChange={setCombine}
              />
              <ToggleRow
                label="添加章节标题"
                description="保留目录结构与章节名"
                checked={addChapterTitle}
                onChange={setAddChapterTitle}
              />
            </div>

            <div className="mt-4 space-y-2 rounded-[12px] bg-[#FBFAFE] p-3 text-[10.5px] text-[#8B8BA0]">
              <div className="flex items-center justify-between">
                <span>已选分卷</span>
                <span className="font-semibold text-[#6C4AD9]">{selected.length} 卷</span>
              </div>
              <div className="flex items-center justify-between">
                <span>输出格式</span>
                <span className="text-[#3F4058]">EPUB 3</span>
              </div>
              <div className="flex items-center justify-between">
                <span>预计体积</span>
                <span className="text-[#3F4058]">≈ {(selected.length * 3.2).toFixed(1)} MB</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="mt-4 w-full"
              icon={<Download className="h-4 w-4" />}
              onClick={createTask}
            >
              创建下载任务
            </Button>
            <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[9.5px] text-[#B5B5C6]">
              <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
              任务为异步执行，可在任务页取消
            </p>
          </Card>

          <Card className="p-5">
            <SectionTitle title="书源信息" className="[&_h2]:text-[17px]" />
            <div className="mt-3.5 space-y-2.5 text-[10.5px]">
              <MetaRow label="书源" value={novel.source} />
              <MetaRow label="源 ID" value={novel.sourceId} />
              <MetaRow label="详情接口" value="GET /api/novels/:id" mono />
              <MetaRow label="分卷接口" value="GET /api/novels/:id/volumes" mono />
            </div>
            <p className="mt-3 rounded-[8px] bg-[#FDF8EC] px-2.5 py-2 text-[9.5px] leading-relaxed text-[#B4791B]">
              上述接口在仓库中尚未实现，当前结果显示自 Mock 层。
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 text-left transition',
        checked ? 'border-[#DDD4FA] bg-[#FBFAFF]' : 'border-[#EFEDF6] bg-white hover:bg-[#FBFAFE]',
      )}
    >
      <span>
        <span className="block text-[11.5px] font-semibold text-[#3F4058]">{label}</span>
        <span className="mt-0.5 block text-[9.5px] text-[#A2A2B6]">{description}</span>
      </span>
      <span
        className={cn(
          'relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-[#7E5EE9]' : 'bg-[#E5E1F1]',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-all duration-200',
            checked ? 'left-[16px]' : 'left-[2px]',
          )}
        />
      </span>
    </button>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[#A2A2B6]">{label}</span>
      <span className={cn('truncate text-right text-[#5B5B73]', mono && 'font-mono text-[9.5px]')}>{value}</span>
    </div>
  )
}

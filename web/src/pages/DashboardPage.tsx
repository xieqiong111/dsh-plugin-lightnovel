import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  Globe2,
  Info,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Badge, Card, Progress, SectionTitle } from '@/components/common/ui'
import { CoverArt } from '@/components/novel/CoverArt'
import { HeroArt } from '@/components/novel/HeroArt'
import { NovelCard } from '@/components/novel/NovelCard'
import { useAsync } from '@/hooks/useAsync'
import { novelApi } from '@/services/novelApi'
import { IS_LIVE } from '@/services/runtime'
import { useTasks } from '@/services/taskStore'
import { cn } from '@/services/utils'

const features = [
  {
    to: '/search',
    title: '探索轻小说',
    subtitle: '关键词、作者、多书源',
    icon: Search,
    tile: 'bg-accent-soft text-accent',
  },
  {
    to: '/tasks',
    title: '下载与打包',
    subtitle: '分卷选择 · EPUB',
    icon: Download,
    tile: 'bg-info-soft text-info',
  },
  {
    to: '/library',
    title: '本地书库',
    subtitle: '文件管理 · 完整性校验',
    icon: BookOpen,
    tile: 'bg-positive-soft text-positive',
  },
  {
    to: '/sources',
    title: '书源状态',
    subtitle: '公开抓取 · 搜索限制',
    icon: Globe2,
    tile: 'bg-negative-soft text-negative',
  },
]

export function DashboardPage() {
  const [keyword, setKeyword] = useState('')
  const navigate = useNavigate()
  const tasks = useTasks()
  const { data: overview } = useAsync(async () => {
    const [novels, recent, libraryStats, activities] = await Promise.all([
      novelApi.getFeatured(),
      novelApi.listLibrary(),
      novelApi.getLibraryStats(),
      novelApi.getActivities(),
    ])
    return { novels, recent, libraryStats, activities }
  }, [])
  const running = tasks.filter((task) => task.state === 'running' || task.state === 'queued').slice(0, 2)
  const featured = (overview?.novels ?? []).slice(0, 5)
  const recentLibrary = (overview?.recent ?? []).slice(0, 3)
  const stats = overview?.libraryStats ?? { epubs: 0, tasks: 0, queued: 0, verified: 0 }
  const recentActivities = overview?.activities ?? []

  const search = (value?: string) => {
    const query = (value ?? keyword).trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  return (
    <div>
      {/* Hero */}
      <section data-testid="hero" className="relative overflow-hidden rounded-[22px] border border-accent-line studio-hero px-8 pb-8 pt-6 shadow-[0_20px_60px_-42px_rgba(109,78,224,0.65)] lg:h-[289px] lg:px-10 lg:pb-0 lg:pt-3">
        <div className="pointer-events-none absolute -right-10 -top-24 h-[380px] w-[380px] rounded-full border border-white/50" />
        <div className="pointer-events-none absolute right-6 top-0 h-full w-[420px] grid-dots opacity-35 [mask-image:linear-gradient(to_left,black,transparent_78%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-[-120px] h-56 w-56 rounded-full bg-[var(--hero-glow)] blur-2xl" />
        <HeroArt />

        <div className="relative z-10 max-w-[660px]">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            Find your next story
          </p>
          <h1 className="mt-3 text-[30px] font-bold leading-[1.18] tracking-[-0.02em] text-ink sm:text-[36px] xl:text-[39px]">
            在故事之间，
            <span className="text-gradient">找到下一次心动。</span>
          </h1>
          <p className="mt-2 text-[12.5px] text-ink-soft">
            基于 DeepSeek Harness · 探索轻小说、管理 EPUB、跟踪下载进度
          </p>

          <div className="mt-4 flex w-full max-w-[600px] items-center gap-2 rounded-full bg-surface p-1.5 pl-5 shadow-[0_14px_34px_-22px_rgba(72,52,150,0.55)] ring-1 ring-accent-line">
            <Search className="h-[17px] w-[17px] shrink-0 text-ink-muted" strokeWidth={1.8} />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') search()
              }}
              placeholder="输入书名、作者或关键词，开始探索..."
              aria-label="搜索书名、作者或关键词"
              className="h-11 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={() => search()}
              className="flex h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-[linear-gradient(95deg,#8B6BF0,#7E5EE9_55%,#6C4AD9)] px-6 text-[12.5px] font-semibold text-white shadow-[0_10px_22px_-12px_rgba(108,74,217,0.9)] transition hover:brightness-105 active:scale-[0.98]"
            >
              探索书籍
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-surface/60 px-3 py-[5px] text-[10px] text-ink-soft backdrop-blur-sm">
              <Info className="h-3 w-3 text-accent" />
              {IS_LIVE ? '已连接插件运行时 · 检索本地索引与已配置书源' : '交互设计演示，搜索仅过滤样例数据'}
            </span>
            <div className="hidden items-center gap-2 text-[10.5px] text-ink-muted md:flex">
              <span className="text-ink-muted">热门</span>
              {['月下的茶馆', '无职转生', '86'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => search(tag)}
                  className="rounded-full px-1.5 py-0.5 transition hover:bg-surface/60 hover:text-accent"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 功能入口 */}
      <section data-testid="features" className="mt-[18px] grid grid-cols-2 gap-3.5 xl:grid-cols-4 xl:gap-5">
        {features.map((feature) => (
          <Link
            key={feature.title}
            to={feature.to}
            className="group flex h-[75px] items-center gap-3.5 rounded-[16px] border border-line bg-surface px-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-line hover:shadow-lift"
          >
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10', feature.tile)}>
              <feature.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-ink sm:text-[13.5px]">{feature.title}</span>
              <span className="mt-0.5 block truncate text-[10px] text-ink-muted sm:text-[11px]">{feature.subtitle}</span>
            </span>
            <ArrowRight className="ml-auto hidden h-3.5 w-3.5 shrink-0 text-[#C4B5FB] opacity-0 transition group-hover:block group-hover:opacity-100" />
          </Link>
        ))}
      </section>

      <div className="mt-[32px] grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-[20px]">
          {/* 为你精选（Live 模式只展示已正式入库的 EPUB） */}
          <Card data-testid="featured" className="p-0">
            <div className="flex items-center justify-between px-6 pb-4 pt-4">
              <SectionTitle title={IS_LIVE ? '已入库书籍' : '为你精选'} />
              <Link
                to={IS_LIVE ? '/library' : '/search'}
                className="group inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent transition hover:text-accent"
              >
                {IS_LIVE ? '管理书库' : '探索更多'}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 px-6 pb-6 sm:grid-cols-3 xl:grid-cols-5 xl:gap-[15px]">
              {featured.length === 0 ? (
                <div className="col-span-full rounded-[12px] border border-dashed border-accent-line bg-surface-soft px-4 py-8 text-center">
                  <BookOpen className="mx-auto h-6 w-6 text-ink-muted" />
                  <p className="mt-2 text-[12px] font-medium text-ink-soft">书库暂无已入库 EPUB</p>
                  <p className="mt-1 text-[10.5px] text-ink-muted">
                    只有下载并正式写入书库的书才会显示在这里。
                  </p>
                  <Link
                    to="/search"
                    className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent"
                  >
                    去搜索并下载
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                featured.map((novel) => (
                  <NovelCard
                    key={novel.id}
                    novel={novel}
                    onOpen={() => navigate(`/novel/${encodeURIComponent(novel.id)}`)}
                  />
                ))
              )}
            </div>
          </Card>

          {/* 最近入库 */}
          <Card data-testid="recent" className="p-0">
            <div className="flex items-center justify-between px-6 pb-4 pt-6">
              <SectionTitle title="最近入库" />
              <Link
                to="/library"
                className="group inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent transition hover:text-accent"
              >
                管理书库
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="px-6 pb-5">
              <div className="hidden grid-cols-[minmax(0,1fr)_92px_74px_96px] items-center gap-4 rounded-[10px] bg-surface-soft px-4 py-2 text-[10.5px] text-ink-muted sm:grid">
                <span>书籍 / EPUB 文件</span>
                <span>卷数</span>
                <span>大小</span>
                <span>完整性</span>
              </div>
              <div className="divide-y divide-[#F4F2FA]">
                {recentLibrary.map((item) => (
                  <div
                    key={item.id}
                    className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-[11px] transition hover:bg-surface-soft sm:grid-cols-[minmax(0,1fr)_92px_74px_96px] sm:gap-4 sm:px-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <CoverArt
                        theme={item.cover}
                        index={item.coverIndex}
                        mini className="h-[42px] w-[32px] shrink-0 rounded-[7px]"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-ink">{item.title}</p>
                        <p className="mt-1 truncate text-[10px] tracking-[0.02em] text-ink-muted">{item.fileName}</p>
                        <p className="mt-1 text-[10px] text-ink-muted sm:hidden">
                          {item.volumeLabel} · {item.size}
                        </p>
                      </div>
                    </div>
                    <span className="hidden truncate text-[11.5px] text-ink-soft sm:block">{item.volumeLabel}</span>
                    <span className="hidden text-[11.5px] text-ink-soft sm:block">{item.size}</span>
                    <span>
                      <IntegrityBadge state={item.integrity} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* 右栏 */}
        <div className="space-y-[19px]">
          <Card data-testid="downloads" className="p-4">
            <div className="flex items-center justify-between">
              <SectionTitle title="下载任务" className="[&_h2]:text-[18px]" />
              <Link
                to="/tasks"
                className="group inline-flex items-center gap-1 text-[11px] font-medium text-accent transition hover:text-accent"
              >
                查看全部
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-3 space-y-3">
              {running.map((task, index) => (
                <div key={task.id} className={cn(index > 0 && 'border-t border-line pt-4')}>
                  <div className="flex items-start gap-3">
                    <CoverArt
                      theme={task.cover}
                      index={task.coverIndex}
                      mini
                      className="h-[42px] w-[32px] shrink-0 rounded-[6px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink">{task.title}</p>
                      <p className="mt-1 truncate text-[10.5px] text-ink-muted">
                        {task.state === 'queued' ? '排队中' : '下载中'} · {task.volumeLabel} · {task.chapterLabel}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <Progress value={task.percent} className="flex-1" />
                    <span className="w-8 text-right text-[10px] font-semibold text-ink-soft">{task.percent}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card data-testid="stats" className="p-4">
            <SectionTitle title="书库概览" className="[&_h2]:text-[18px]" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatTile icon={<BookOpen className="h-4 w-4" />} value={stats.epubs} label="EPUB 文件" />
              <StatTile icon={<Download className="h-4 w-4" />} value={stats.tasks} label="全部任务" />
              <StatTile icon={<Clock className="h-4 w-4" />} value={stats.queued} label="运行/排队" />
              <StatTile icon={<ShieldCheck className="h-4 w-4" />} value={stats.verified} label="通过校验" />
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 rounded-[9px] bg-surface-soft px-2.5 py-2 text-[9.5px] leading-relaxed text-ink-muted">
              <Info className="mt-[1px] h-3 w-3 shrink-0 text-[#C4B5FB]" />
              {IS_LIVE ? '指标来自本地书库索引与任务存储' : '所有指标为本地模拟数据'}
            </p>
          </Card>

          <Card data-testid="activity" className="px-6 py-5">
            <SectionTitle title="最近活动" className="[&_h2]:text-[18px]" />
            <div className="mt-4 space-y-4">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      'mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full',
                      activity.kind === 'failure'
                        ? 'bg-caution-soft text-caution'
                        : activity.kind === 'success'
                          ? 'bg-positive-soft text-positive'
                          : 'bg-accent-soft text-accent',
                    )}
                  >
                    {activity.kind === 'failure' ? (
                      <AlertTriangle className="h-2.5 w-2.5" />
                    ) : (
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] leading-relaxed text-ink">{activity.title}</p>
                    <p className="mt-1 text-[10px] text-ink-muted">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <footer className="flex flex-col items-center justify-between gap-2 border-t border-line py-5 text-[9.5px] text-ink-muted sm:flex-row">
        <span>Made for light-novel explorers ✦</span>
        <span className="tracking-[0.02em]">DSH Plugin LightNovel · UI Concept v1.0</span>
      </footer>
    </div>
  )
}

function IntegrityBadge({ state }: { state: 'passed' | 'pending' | 'failed' }) {
  if (state === 'failed') return <Badge tone="rose">校验失败</Badge>
  if (state === 'pending') return <Badge tone="amber">待校验</Badge>
  return (
    <Badge tone="violet" className="bg-accent-soft text-accent">
      校验通过
    </Badge>
  )
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[12px] border border-line bg-surface px-3 py-3 transition hover:border-accent-line hover:bg-surface-soft">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-accent-soft text-accent">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[17px] font-bold leading-none tracking-[-0.01em] text-ink">{value}</span>
        <span className="mt-1 block truncate text-[9.5px] text-ink-muted">{label}</span>
      </span>
    </div>
  )
}

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
import { activities, library, libraryStats, novels } from '@/data/mock'
import { useTasks } from '@/services/taskStore'
import { cn } from '@/services/utils'

const featured = novels.slice(0, 5)

const features = [
  {
    to: '/search',
    title: '探索轻小说',
    subtitle: '关键词、作者、多书源',
    icon: Search,
    tile: 'bg-[#F3EFFF] text-[#7E5EE9]',
  },
  {
    to: '/tasks',
    title: '下载与打包',
    subtitle: '分卷选择 · EPUB',
    icon: Download,
    tile: 'bg-[#EAF4FE] text-[#3B82F6]',
  },
  {
    to: '/library',
    title: '本地书库',
    subtitle: '文件管理 · 完整性校验',
    icon: BookOpen,
    tile: 'bg-[#EAF9F2] text-[#10B981]',
  },
  {
    to: '/sources',
    title: '书源状态',
    subtitle: '公开抓取 · 搜索限制',
    icon: Globe2,
    tile: 'bg-[#FFF0F5] text-[#EC4899]',
  },
]

export function DashboardPage() {
  const [keyword, setKeyword] = useState('')
  const navigate = useNavigate()
  const tasks = useTasks()
  const running = tasks.filter((task) => task.state === 'running' || task.state === 'queued').slice(0, 2)

  const search = (value?: string) => {
    const query = (value ?? keyword).trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  return (
    <div>
      {/* Hero */}
      <section data-testid="hero" className="relative overflow-hidden rounded-[22px] border border-[#E9E4FA] bg-[linear-gradient(100deg,#F5F2FF_0%,#EFEBFF_36%,#E6E0FD_64%,#D6CEF9_88%,#C9C1F5_100%)] px-8 pb-8 pt-6 shadow-[0_20px_60px_-42px_rgba(109,78,224,0.65)] lg:h-[289px] lg:px-10 lg:pb-0 lg:pt-3">
        <div className="pointer-events-none absolute -right-10 -top-24 h-[380px] w-[380px] rounded-full border border-white/50" />
        <div className="pointer-events-none absolute right-6 top-0 h-full w-[420px] grid-dots opacity-35 [mask-image:linear-gradient(to_left,black,transparent_78%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-[-120px] h-56 w-56 rounded-full bg-white/40 blur-2xl" />
        <HeroArt />

        <div className="relative z-10 max-w-[660px]">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8B63F2]">
            <Sparkles className="h-3.5 w-3.5" />
            Find your next story
          </p>
          <h1 className="mt-3 text-[30px] font-bold leading-[1.18] tracking-[-0.02em] text-[#1E1F35] sm:text-[36px] xl:text-[39px]">
            在故事之间，
            <span className="text-gradient">找到下一次心动。</span>
          </h1>
          <p className="mt-2 text-[12.5px] text-[#7E7E97]">
            基于 DeepSeek Harness · 探索轻小说、管理 EPUB、跟踪下载进度
          </p>

          <div className="mt-4 flex w-full max-w-[600px] items-center gap-2 rounded-full bg-white p-1.5 pl-5 shadow-[0_14px_34px_-22px_rgba(72,52,150,0.55)] ring-1 ring-[#E7E1FA]">
            <Search className="h-[17px] w-[17px] shrink-0 text-[#A6A6B8]" strokeWidth={1.8} />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') search()
              }}
              placeholder="输入书名、作者或关键词，开始探索..."
              aria-label="搜索书名、作者或关键词"
              className="h-11 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-[#33344B] placeholder:text-[#ADADC0] focus:outline-none"
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#DCD4FA] bg-white/60 px-3 py-[5px] text-[10px] text-[#7E7E97] backdrop-blur-sm">
              <Info className="h-3 w-3 text-[#A78BFA]" />
              交互设计演示，搜索仅过滤样例数据
            </span>
            <div className="hidden items-center gap-2 text-[10.5px] text-[#9A94B5] md:flex">
              <span className="text-[#B0A9C9]">热门</span>
              {['月下的茶馆', '无职转生', '86'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => search(tag)}
                  className="rounded-full px-1.5 py-0.5 transition hover:bg-white/60 hover:text-[#6C4AD9]"
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
            className="group flex h-[75px] items-center gap-3.5 rounded-[16px] border border-[#EFEDF6] bg-white px-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-[#E2DBF8] hover:shadow-lift"
          >
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10', feature.tile)}>
              <feature.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-[#2B2C44] sm:text-[13.5px]">{feature.title}</span>
              <span className="mt-0.5 block truncate text-[10px] text-[#A2A2B6] sm:text-[11px]">{feature.subtitle}</span>
            </span>
            <ArrowRight className="ml-auto hidden h-3.5 w-3.5 shrink-0 text-[#C4B5FB] opacity-0 transition group-hover:block group-hover:opacity-100" />
          </Link>
        ))}
      </section>

      <div className="mt-[32px] grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-[20px]">
          {/* 为你精选 */}
          <Card data-testid="featured" className="p-0">
            <div className="flex items-center justify-between px-6 pb-4 pt-4">
              <SectionTitle title="为你精选" />
              <Link
                to="/search"
                className="group inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#8B7CC8] transition hover:text-[#6C4AD9]"
              >
                探索更多
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 px-6 pb-6 sm:grid-cols-3 xl:grid-cols-5 xl:gap-[15px]">
              {featured.map((novel) => (
                <NovelCard
                  key={novel.id}
                  novel={novel}
                  onOpen={() => navigate(`/novel/${encodeURIComponent(novel.id)}`)}
                />
              ))}
            </div>
          </Card>

          {/* 最近入库 */}
          <Card data-testid="recent" className="p-0">
            <div className="flex items-center justify-between px-6 pb-4 pt-6">
              <SectionTitle title="最近入库" />
              <Link
                to="/library"
                className="group inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#8B7CC8] transition hover:text-[#6C4AD9]"
              >
                管理书库
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="px-6 pb-5">
              <div className="hidden grid-cols-[minmax(0,1fr)_92px_74px_96px] items-center gap-4 rounded-[10px] bg-[#F8F7FC] px-4 py-2 text-[10.5px] text-[#9C9CB0] sm:grid">
                <span>书籍 / EPUB 文件</span>
                <span>卷数</span>
                <span>大小</span>
                <span>完整性</span>
              </div>
              <div className="divide-y divide-[#F4F2FA]">
                {library.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-[11px] transition hover:bg-[#FBFAFE] sm:grid-cols-[minmax(0,1fr)_92px_74px_96px] sm:gap-4 sm:px-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <CoverArt
                        theme={item.cover}
                        index={item.coverIndex}
                        mini className="h-[42px] w-[32px] shrink-0 rounded-[7px]"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#2B2C44]">{item.title}</p>
                        <p className="mt-1 truncate text-[10px] tracking-[0.02em] text-[#A6A6B8]">{item.fileName}</p>
                        <p className="mt-1 text-[10px] text-[#8F8FA4] sm:hidden">
                          {item.volumeLabel} · {item.size}
                        </p>
                      </div>
                    </div>
                    <span className="hidden truncate text-[11.5px] text-[#6B6B85] sm:block">{item.volumeLabel}</span>
                    <span className="hidden text-[11.5px] text-[#6B6B85] sm:block">{item.size}</span>
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
                className="group inline-flex items-center gap-1 text-[11px] font-medium text-[#8B7CC8] transition hover:text-[#6C4AD9]"
              >
                查看全部
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-3 space-y-3">
              {running.map((task, index) => (
                <div key={task.id} className={cn(index > 0 && 'border-t border-[#F3F1F9] pt-4')}>
                  <div className="flex items-start gap-3">
                    <CoverArt
                      theme={task.cover}
                      index={task.coverIndex}
                      mini
                      className="h-[42px] w-[32px] shrink-0 rounded-[6px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#2B2C44]">{task.title}</p>
                      <p className="mt-1 truncate text-[10.5px] text-[#A6A6B8]">
                        {task.state === 'queued' ? '排队中' : '下载中'} · {task.volumeLabel} · {task.chapterLabel}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <Progress value={task.percent} className="flex-1" />
                    <span className="w-8 text-right text-[10px] font-semibold text-[#6B6B85]">{task.percent}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card data-testid="stats" className="p-4">
            <SectionTitle title="书库概览" className="[&_h2]:text-[18px]" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatTile icon={<BookOpen className="h-4 w-4" />} value={libraryStats.epubs} label="EPUB 文件" />
              <StatTile icon={<Download className="h-4 w-4" />} value={libraryStats.tasks} label="全部任务" />
              <StatTile icon={<Clock className="h-4 w-4" />} value={libraryStats.queued} label="运行/排队" />
              <StatTile icon={<ShieldCheck className="h-4 w-4" />} value={libraryStats.verified} label="通过校验" />
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 rounded-[9px] bg-[#FBFAFE] px-2.5 py-2 text-[9.5px] leading-relaxed text-[#A2A2B6]">
              <Info className="mt-[1px] h-3 w-3 shrink-0 text-[#C4B5FB]" />
              所有指标为本地模拟数据
            </p>
          </Card>

          <Card data-testid="activity" className="px-6 py-5">
            <SectionTitle title="最近活动" className="[&_h2]:text-[18px]" />
            <div className="mt-4 space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      'mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full',
                      activity.kind === 'failure'
                        ? 'bg-[#FEF6E7] text-[#F59E0B]'
                        : activity.kind === 'success'
                          ? 'bg-[#ECFDF5] text-[#10B981]'
                          : 'bg-[#F1EDFE] text-[#8B63F2]',
                    )}
                  >
                    {activity.kind === 'failure' ? (
                      <AlertTriangle className="h-2.5 w-2.5" />
                    ) : (
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] leading-relaxed text-[#4A4B63]">{activity.title}</p>
                    <p className="mt-1 text-[10px] text-[#A9A9BC]">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <footer className="flex flex-col items-center justify-between gap-2 border-t border-[#EFEDF6] py-5 text-[9.5px] text-[#B5B5C6] sm:flex-row">
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
    <Badge tone="violet" className="bg-[#F1EDFE] text-[#6C4AD9]">
      校验通过
    </Badge>
  )
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[12px] border border-[#F1EFF8] bg-white px-3 py-3 transition hover:border-[#E3DCF8] hover:bg-[#FCFBFF]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#F6F3FF] text-[#7E5EE9]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[17px] font-bold leading-none tracking-[-0.01em] text-[#25263C]">{value}</span>
        <span className="mt-1 block truncate text-[9.5px] text-[#A2A2B6]">{label}</span>
      </span>
    </div>
  )
}

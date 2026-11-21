import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell, ChevronRight, ExternalLink, Menu, Sparkles } from 'lucide-react'
import { cn } from '@/services/utils'
import { useAsync } from '@/hooks/useAsync'
import { novelApi } from '@/services/novelApi'
import { DEMO, IS_LIVE } from '@/services/runtime'
import { ThemeToggle } from './ThemeToggle'

const routeMeta: Record<string, { group: string; title: string; eyebrow?: string }> = {
  '/': { group: '工作台', title: '工作台' },
  '/search': { group: '资源搜索', title: '搜索发现' },
  '/library': { group: '资源书库', title: '我的书库' },
  '/tasks': { group: '下载任务', title: '下载任务' },
  '/sources': { group: '资源源管理', title: '资源源管理' },
  '/auto-update': { group: '自动追更', title: '自动追更' },
  '/stats': { group: '统计分析', title: '统计分析' },
  '/settings': { group: '系统设置', title: '系统设置' },
}

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const location = useLocation()
  const [notifyOpen, setNotifyOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const { data: activityData } = useAsync(() => novelApi.getActivities(), [notifyOpen])
  const activityItems = activityData ?? []

  const title = routeMeta[location.pathname]?.title ?? (location.pathname.startsWith('/manga/') ? '漫画详情' : '小说详情')

  useEffect(() => {
    if (!notifyOpen) return
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setNotifyOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [notifyOpen])

  return (
    <header className="sticky top-0 z-40 flex h-[76px] items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur-xl sm:gap-4 sm:px-5 lg:px-9">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="打开导航"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-ink-soft lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="hidden items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-muted sm:flex">
          Novel &amp; Manga
        </span>
        <ChevronRight className="hidden h-3 w-3 text-ink-muted sm:block" />
        <span className="truncate text-[12.5px] font-medium text-ink-soft">{title}</span>
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[6px] text-[10px] font-medium sm:px-4 sm:text-[11.5px]',
            IS_LIVE ? 'border-positive-line bg-positive-soft text-positive' : 'border-caution-line bg-caution-soft text-caution',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', IS_LIVE ? 'bg-[#10B981]' : 'bg-[#F59E0B]')} />
          {DEMO.label}
        </span>

        <a
          href="https://github.com/xieqiong111/dsh-plugin-lightnovel"
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-1.5 rounded-full px-3 py-[6px] text-[11.5px] font-medium text-ink-soft transition hover:bg-accent-soft hover:text-accent sm:inline-flex"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          查看仓库
        </a>

        <ThemeToggle />

        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={() => setNotifyOpen((open) => !open)}
            aria-label="通知"
            aria-expanded={notifyOpen}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:bg-accent-soft hover:text-accent',
              notifyOpen && 'bg-accent-soft text-accent',
            )}
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#7E5EE9] ring-2 ring-surface" />
          </button>

          {notifyOpen && (
            <div className="fixed right-3 top-[66px] w-[min(300px,calc(100vw-24px))] sm:absolute sm:right-0 sm:top-11 rounded-[18px] border border-line bg-surface p-3 shadow-[0_24px_60px_-24px_rgba(30,31,53,0.35)] animate-fade-up">
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-[12px] font-semibold text-ink">通知</p>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent">
                  {IS_LIVE ? '运行时日志' : '示例'}
                </span>
              </div>
              <div className="space-y-1">
                {activityItems.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-xl px-2 py-2 transition hover:bg-surface-soft">
                    <p className="text-[11.5px] leading-snug text-ink">{item.title}</p>
                    <p className="mt-1 text-[10px] text-ink-muted">{item.time}</p>
                  </div>
                ))}
                {activityItems.length === 0 && (
                  <p className="px-2 py-3 text-[10.5px] text-ink-muted">暂无活动记录。</p>
                )}
              </div>
              <p className="mt-2 border-t border-line px-1 pt-2 text-[10px] leading-relaxed text-ink-muted">
                {IS_LIVE ? '来自插件结构化日志（GET /api/activities）。' : '通知为本地演示数据。'}
              </p>
            </div>
          )}
        </div>

        <Link to="/settings" className="group flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8B6BF0,#5D3FC9)] text-[11px] font-bold text-white ring-2 ring-surface transition group-hover:brightness-110">
            NM
            <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-[#C4B5FB]" />
          </span>
        </Link>
      </div>
    </header>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell, ChevronRight, ExternalLink, Menu, Sparkles } from 'lucide-react'
import { cn } from '@/services/utils'
import { activities } from '@/data/mock'

const routeMeta: Record<string, { group: string; title: string; eyebrow?: string }> = {
  '/': { group: '工作台', title: '工作台' },
  '/search': { group: '小说搜索', title: '搜索发现' },
  '/library': { group: '小说书库', title: '我的书库' },
  '/tasks': { group: '下载任务', title: '下载任务' },
  '/sources': { group: '书源管理', title: '书源状态' },
  '/auto-update': { group: '自动追更', title: '自动追更' },
  '/stats': { group: '统计分析', title: '统计分析' },
  '/settings': { group: '系统设置', title: '系统设置' },
}

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const location = useLocation()
  const [notifyOpen, setNotifyOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const meta = routeMeta[location.pathname] ?? { group: '小说详情', title: '小说详情' }
  const title = location.pathname.startsWith('/novel/') ? '小说详情' : meta.title

  useEffect(() => {
    if (!notifyOpen) return
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setNotifyOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [notifyOpen])

  return (
    <header className="sticky top-0 z-40 flex h-[76px] items-center gap-4 border-b border-[#EFEDF6] bg-white/85 px-5 backdrop-blur-xl lg:px-9">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="打开导航"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#EFEDF6] text-[#6B6B85] lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="hidden items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[#A6A6B8] sm:flex">
          Lightnovel
        </span>
        <ChevronRight className="hidden h-3 w-3 text-[#C5C5D4] sm:block" />
        <span className="truncate text-[12.5px] font-medium text-[#5B5B73]">{title}</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-[#F5E3BE] bg-[#FDF6E8] px-4 py-[6px] text-[11.5px] font-medium text-[#B4791B] md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
          交互原型 · 非真实数据
        </span>

        <a
          href="https://github.com/xieqiong111/dsh-plugin-lightnovel"
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-1.5 rounded-full px-3 py-[6px] text-[11.5px] font-medium text-[#7A7A92] transition hover:bg-[#F6F4FE] hover:text-[#6C4AD9] sm:inline-flex"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          查看仓库
        </a>

        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={() => setNotifyOpen((open) => !open)}
            aria-label="通知"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-full text-[#8B8BA0] transition hover:bg-[#F6F4FE] hover:text-[#6C4AD9]',
              notifyOpen && 'bg-[#F6F4FE] text-[#6C4AD9]',
            )}
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#7E5EE9] ring-2 ring-white" />
          </button>

          {notifyOpen && (
            <div className="absolute right-0 top-11 w-[300px] rounded-[18px] border border-[#EFEDF6] bg-white p-3 shadow-[0_24px_60px_-24px_rgba(30,31,53,0.35)] animate-fade-up">
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-[12px] font-semibold text-[#2B2C44]">通知</p>
                <span className="rounded-full bg-[#F1EDFE] px-2 py-0.5 text-[10px] text-[#6C4AD9]">示例</span>
              </div>
              <div className="space-y-1">
                {activities.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-xl px-2 py-2 transition hover:bg-[#FBFAFE]">
                    <p className="text-[11.5px] leading-snug text-[#3F4058]">{item.title}</p>
                    <p className="mt-1 text-[10px] text-[#A6A6B8]">{item.time}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 border-t border-[#F3F1F9] px-1 pt-2 text-[10px] leading-relaxed text-[#A6A6B8]">
                通知为本地演示数据，接入真实 API 后将展示任务与书源事件。
              </p>
            </div>
          )}
        </div>

        <Link to="/settings" className="group flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8B6BF0,#5D3FC9)] text-[11px] font-bold text-white ring-2 ring-white transition group-hover:brightness-110">
            LN
            <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-[#C4B5FB]" />
          </span>
        </Link>
      </div>
    </header>
  )
}

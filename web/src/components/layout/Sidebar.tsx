import type { LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Download,
  Github,
  Globe2,
  Home,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react'
import { cn } from '@/services/utils'
import { useTasks } from '@/services/taskStore'

const workspaceLinks = [
  { to: '/', label: '工作台', icon: Home, end: true },
  { to: '/search', label: '搜索发现', icon: Search },
  { to: '/library', label: '我的书库', icon: BookOpen },
  { to: '/tasks', label: '下载任务', icon: Download, badge: true },
  { to: '/sources', label: '书源状态', icon: Globe2 },
  { to: '/auto-update', label: '自动追更', icon: RefreshCw },
  { to: '/stats', label: '统计分析', icon: BarChart3 },
]

const systemLinks = [
  { to: '/settings', label: '系统设置', icon: Settings2 },
  { to: 'https://github.com/xieqiong111/dsh-plugin-lightnovel', label: 'GitHub 项目', icon: Github, external: true },
]

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const tasks = useTasks()
  const running = tasks.filter((t) => t.state === 'running').length
  const location = useLocation()

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="关闭导航"
          className="fixed inset-0 z-[60] bg-[#171632]/40 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[70] flex w-[248px] flex-col overflow-hidden',
          'bg-[linear-gradient(180deg,#181935_0%,#1D1E3F_55%,#262352_100%)]',
          'transition-transform duration-300 ease-out lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* 装饰光晕 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[320px] bg-[radial-gradient(120%_80%_at_20%_100%,rgba(124,92,232,0.35)_0%,rgba(124,92,232,0)_62%)]" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[#6C4AD9]/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-28 right-6 h-16 w-16 rounded-full border border-white/10" />

        <div className="relative flex h-[84px] shrink-0 items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-gradient-to-br from-[#9C7CF6] to-[#6C4AD9] shadow-[0_10px_24px_-8px_rgba(124,92,232,0.9)] ring-1 ring-white/20">
              <BookOpen className="h-[19px] w-[19px] text-white" strokeWidth={1.9} />
            </div>
            <div className="leading-tight">
              <p className="text-[16px] font-bold tracking-[0.02em] text-white">轻小说管理中心</p>
              <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.26em] text-[#9395BE]">
                Lightnovel Studio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="收起导航"
            className="text-white/60 hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="relative flex-1 overflow-y-auto pb-4 no-scrollbar">
          <p className="px-6 pb-3 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-[#7F81AC]">Workspace</p>
          <div className="space-y-[3px] px-4">
            {workspaceLinks.map((link) => (
              <NavItem
                key={link.to}
                {...link}
                active={
                  link.end
                    ? location.pathname === '/'
                    : location.pathname === link.to || location.pathname.startsWith(`${link.to}/`)
                }
                badgeCount={link.badge ? running : undefined}
              />
            ))}
          </div>

          <p className="px-6 pb-3 pt-7 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-[#7F81AC]">System</p>
          <div className="space-y-[3px] px-4">
            {systemLinks.map((link) => (
              <NavItem key={link.label} {...link} active={location.pathname === link.to} />
            ))}
          </div>
        </nav>

        <div className="relative px-4 pb-4">
          <div className="rounded-[16px] border border-white/10 bg-white/[0.055] p-3.5 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#7E5EE9]/25 text-[#C4B5FB]">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                <p className="truncate text-[12px] font-semibold text-white">Deepseek Harness</p>
                <p className="shrink-0 text-[9.5px] text-[#8E90B8]">v1.0</p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-[#9193BD]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FBBF24]" />
              UI 演示模式
            </div>
          </div>
          <p className="mt-4 text-center text-[7.5px] font-medium uppercase tracking-[0.3em] text-[#5E608A]">
            Designed for DSH · 2026
          </p>
        </div>
      </aside>
    </>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  external,
  active,
  badgeCount,
}: {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  external?: boolean
  active?: boolean
  badgeCount?: number
}) {
  const content = (
    <>
      <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-white' : 'text-[#9C9EC4]')} strokeWidth={1.7} />
      <span className={cn('flex-1 text-left text-[14.5px] tracking-[0.01em]', active ? 'font-semibold text-white' : 'text-[#C6C8E0]')}>
        {label}
      </span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          className={cn(
            'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold',
            active ? 'bg-white/25 text-white' : 'bg-[#6C4AD9]/45 text-[#DDD6FF]',
          )}
        >
          {badgeCount}
        </span>
      )}
      {external && <ChevronRight className="h-3.5 w-3.5 text-[#6E7099] opacity-70" />}
    </>
  )

  const base = cn(
    'group flex h-[46px] items-center gap-3 rounded-[13px] px-3.5 transition-all duration-200',
    active
      ? 'bg-[linear-gradient(90deg,#8B6BF0_0%,#7A5AE7_55%,#6C4AD9_100%)] shadow-[0_12px_26px_-12px_rgba(124,92,232,0.9)] ring-1 ring-inset ring-white/15'
      : 'hover:bg-white/[0.055]',
  )

  if (external) {
    return (
      <a href={to} target="_blank" rel="noreferrer" className={base}>
        {content}
      </a>
    )
  }

  return (
    <NavLink to={to} end={end} className={base} onClick={() => {}} aria-current={active ? 'page' : undefined}>
      {content}
    </NavLink>
  )
}

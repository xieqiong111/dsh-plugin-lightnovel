import type { ReactNode } from 'react'
import { Activity, BookOpen, Download, HardDrive, Info, TrendingUp } from 'lucide-react'
import { Badge, Card, EmptyState, SectionTitle } from '@/components/common/ui'
import { PageHeader } from '@/components/common/PageHeader'
import { CoverArt } from '@/components/novel/CoverArt'
import { novels as MOCK_NOVELS } from '@/data/mock'
import { useAsync } from '@/hooks/useAsync'
import { novelApi } from '@/services/novelApi'
import { DEMO, IS_LIVE } from '@/services/runtime'
import { cn, formatBytes } from '@/services/utils'
import type { TaskState } from '@/types'

const weekly = [
  { day: '周一', value: 3 },
  { day: '周二', value: 5 },
  { day: '周三', value: 2 },
  { day: '周四', value: 7 },
  { day: '周五', value: 4 },
  { day: '周六', value: 9 },
  { day: '周日', value: 6 },
]

const sourcesShare = [
  { name: 'Bilinovel', value: 54, color: '#7E5EE9' },
  { name: '本地索引', value: 28, color: '#A78BFA' },
  { name: '示例源', value: 12, color: '#C4B5FB' },
  { name: '其他', value: 6, color: '#E4DEFA' },
]

const TASK_LABELS: Record<TaskState, string> = {
  running: '进行中',
  queued: '排队中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}
const TASK_COLORS: Record<TaskState, string> = {
  running: '#7E5EE9',
  queued: '#A78BFA',
  completed: '#10B981',
  failed: '#F472B6',
  cancelled: '#C4B5FB',
}
const PIE_COLORS = ['#7E5EE9', '#A78BFA', '#C4B5FB', '#E4DEFA', '#D6CEF9', '#EFEAFF']

export function StatsPage() {
  return IS_LIVE ? <LiveStats /> : <MockStats />
}

/* --------------------------- live --------------------------------- */

function LiveStats() {
  const { data } = useAsync(async () => {
    const [stats, tasks, library, featured] = await Promise.all([
      novelApi.getLibraryStats(),
      novelApi.listTasks(),
      novelApi.listLibrary(),
      novelApi.getFeatured(),
    ])
    return { stats, tasks, library, featured }
  }, [])

  const stats = data?.stats
  const tasks = data?.tasks ?? []
  const library = data?.library ?? []
  const featured = data?.featured ?? []

  const taskGroups = (Object.keys(TASK_LABELS) as TaskState[])
    .map((state) => ({ state, label: TASK_LABELS[state], value: tasks.filter((task) => task.state === state).length }))
    .filter((group) => group.value > 0)
  const maxTasks = Math.max(1, ...taskGroups.map((group) => group.value))

  const sourceGroups = Array.from(
    library.reduce((map, item) => {
      const key = item.tags[0] || '未知书源'
      map.set(key, (map.get(key) ?? 0) + 1)
      return map
    }, new Map<string, number>()),
  )
    .map(([name, value], index) => ({ name, value, color: PIE_COLORS[index % PIE_COLORS.length] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
  const sourceTotal = sourceGroups.reduce((sum, item) => sum + item.value, 0) || 1

  return (
    <div>
      <PageHeader
        eyebrow="Analytics · runtime"
        title="统计分析"
        description="指标来自插件运行时的书库索引与任务存储。插件不提供按日下载聚合，因此不展示伪造成的时间序列。"
        actions={<Badge tone="green" className="h-7 px-3">{DEMO.label}</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Download className="h-4 w-4" />} label="全部任务" value={stats?.tasks ?? '—'} delta={`${stats?.queued ?? 0} 进行/排队`} />
        <StatCard icon={<BookOpen className="h-4 w-4" />} label="EPUB 总量" value={stats?.epubs ?? '—'} delta={`${stats?.chapters ?? 0} 章`} />
        <StatCard icon={<HardDrive className="h-4 w-4" />} label="占用空间" value={stats ? formatBytes(stats.bytes) : '—'} delta={`${stats?.failed ?? 0} 校验失败`} />
        <StatCard icon={<Activity className="h-4 w-4" />} label="校验通过" value={stats?.verified ?? '—'} delta={`${tasks.length} 条任务记录`} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <SectionTitle
            title="任务状态分布"
            right={
              <span className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                <TrendingUp className="h-3 w-3 text-positive" />
                共 {tasks.length} 个任务
              </span>
            }
          />
          {taskGroups.length === 0 ? (
            <EmptyState icon={<Activity className="h-6 w-6" />} title="暂无任务记录" description="创建一次下载任务后，这里会按真实状态统计。" />
          ) : (
            <div className="mt-8 flex h-[196px] items-end gap-2.5">
              {taskGroups.map((group) => (
                <div key={group.state} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-[9.5px] font-medium text-ink-soft">{group.value}</span>
                  <div className="relative flex w-full items-end overflow-hidden rounded-t-[8px] bg-surface-soft" style={{ height: 150 }}>
                    <div
                      className="w-full rounded-t-[8px] transition-all duration-700"
                      style={{ height: `${Math.max(6, (group.value / maxTasks) * 100)}%`, background: TASK_COLORS[group.state] }}
                    />
                  </div>
                  <span className="text-[9px] text-ink-muted">{group.label}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 border-t border-line pt-3 text-[9.5px] leading-relaxed text-ink-muted">
            数据来自 GET /api/tasks 的真实状态计数；插件没有按日聚合字段，因此不绘制「近 7 天下载量」。
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle title="书库文件按书源" />
          {sourceGroups.length === 0 ? (
            <EmptyState icon={<HardDrive className="h-6 w-6" />} title="书库为空" description="生成 EPUB 后会按书源统计分布。" />
          ) : (
            <div className="mt-5 flex items-center gap-6">
              <div
                className="relative h-[150px] w-[150px] shrink-0 rounded-full"
                style={{
                  background: `conic-gradient(${sourceGroups
                    .map((item, index) => {
                      const start = sourceGroups.slice(0, index).reduce((sum, entry) => sum + entry.value, 0)
                      return `${item.color} ${(start / sourceTotal) * 100}% ${((start + item.value) / sourceTotal) * 100}%`
                    })
                    .join(',')})`,
                }}
              >
                <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-surface">
                  <span className="text-[9px] text-ink-muted">EPUB</span>
                  <span className="mt-0.5 text-[20px] font-bold text-ink">{library.length}</span>
                </div>
              </div>
              <div className="flex-1 space-y-2.5">
                {sourceGroups.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3 text-[10.5px]">
                    <span className="flex min-w-0 items-center gap-2 text-ink-soft">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="font-semibold text-ink-soft">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <SectionTitle title={library.length ? '最近入库作品' : '可检索书目'} right={<Badge tone="violet">实时</Badge>} />
        <div className="mt-4 space-y-2">
          {(library.length ? library.slice(0, 5).map((item) => ({
            id: item.id, title: item.title, author: item.volumeLabel, source: item.tags[0] ?? '',
            cover: item.cover, coverIndex: item.coverIndex, trailing: item.size,
          })) : featured.slice(0, 5).map((novel) => ({
            id: novel.id, title: novel.title, author: novel.author, source: novel.source,
            cover: novel.cover, coverIndex: novel.coverIndex, trailing: `${novel.volumes} 卷`,
          }))).map((row, index) => (
            <div key={row.id} className="flex items-center gap-3 rounded-[10px] px-2 py-2 transition hover:bg-surface-soft">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  index === 0 ? 'bg-accent-soft text-accent' : index < 3 ? 'bg-accent-soft text-accent' : 'bg-surface-soft text-ink-muted',
                )}
              >
                {index + 1}
              </span>
              <CoverArt theme={row.cover} index={row.coverIndex} mini className="h-[38px] w-[29px] shrink-0 rounded-[5px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-semibold text-ink">{row.title}</p>
                <p className="mt-0.5 truncate text-[9.5px] text-ink-muted">{row.author} · {row.source}</p>
              </div>
              <span className="shrink-0 text-[10px] text-ink-muted">{row.trailing}</span>
            </div>
          ))}
          {library.length === 0 && featured.length === 0 && (
            <p className="py-6 text-center text-[10.5px] text-ink-muted">暂无数据</p>
          )}
        </div>
        <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-[9.5px] leading-relaxed text-ink-muted">
          <Info className="mt-[1px] h-3 w-3 shrink-0 text-[#C4B5FB]" />
          插件不记录「作品下载次数」，故此处展示真实入库体积 / 分卷数，不使用演示排名数值。
        </p>
      </Card>
    </div>
  )
}

/* --------------------------- mock --------------------------------- */

function MockStats() {
  const max = Math.max(...weekly.map((item) => item.value))
  const total = weekly.reduce((sum, item) => sum + item.value, 0)

  return (
    <div>
      <PageHeader
        eyebrow="Analytics · sample"
        title="统计分析"
        description="下载量、书库体积与书源分布的概览。统计口径与数据均来自前端 Mock，仅用于展示可视化样式。"
        actions={<Badge tone="amber" className="h-7 px-3">示例数据</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Download className="h-4 w-4" />} label="本周下载" value="36" delta="+18%" />
        <StatCard icon={<BookOpen className="h-4 w-4" />} label="EPUB 总量" value="3" delta="+1" />
        <StatCard icon={<HardDrive className="h-4 w-4" />} label="占用空间" value="12.4 MB" delta="+2.1" />
        <StatCard icon={<Activity className="h-4 w-4" />} label="平均耗时" value="3m 24s" delta="-12%" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <SectionTitle
            title="近 7 天下载量"
            right={
              <span className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                <TrendingUp className="h-3 w-3 text-positive" />
                共 {total} 次
              </span>
            }
          />
          <div className="mt-8 flex h-[196px] items-end gap-2.5">
            {weekly.map((item, index) => (
              <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[9.5px] font-medium text-ink-soft">{item.value}</span>
                <div className="relative flex w-full items-end overflow-hidden rounded-t-[8px] bg-surface-soft" style={{ height: 150 }}>
                  <div
                    className={cn(
                      'w-full rounded-t-[8px] bg-[linear-gradient(180deg,#A78BFA,#7E5EE9)] transition-all duration-700',
                      index === 5 && 'shadow-[0_10px_24px_-12px_rgba(108,74,217,0.8)]',
                    )}
                    style={{ height: `${Math.max(6, (item.value / max) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-ink-muted">{item.day}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="书源分布" />
          <div className="mt-5 flex items-center gap-6">
            <div
              className="relative h-[150px] w-[150px] shrink-0 rounded-full"
              style={{
                background: `conic-gradient(${sourcesShare
                  .map((item, index) => {
                    const start = sourcesShare.slice(0, index).reduce((sum, entry) => sum + entry.value, 0)
                    return `${item.color} ${start}% ${start + item.value}%`
                  })
                  .join(',')})`,
              }}
            >
              <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-surface">
                <span className="text-[9px] text-ink-muted">总下载</span>
                <span className="mt-0.5 text-[20px] font-bold text-ink">108</span>
              </div>
            </div>
            <div className="flex-1 space-y-2.5">
              {sourcesShare.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 text-[10.5px]">
                  <span className="flex items-center gap-2 text-ink-soft">
                    <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                    {item.name}
                  </span>
                  <span className="font-semibold text-ink-soft">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <SectionTitle title="热门作品" right={<Badge tone="violet">Top 5</Badge>} />
        <div className="mt-4 space-y-2">
          {MOCK_NOVELS.slice(0, 5).map((novel, index) => (
            <div key={novel.id} className="flex items-center gap-3 rounded-[10px] px-2 py-2 transition hover:bg-surface-soft">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  index === 0
                    ? 'bg-accent-soft text-accent'
                    : index < 3
                      ? 'bg-accent-soft text-accent'
                      : 'bg-surface-soft text-ink-muted',
                )}
              >
                {index + 1}
              </span>
              <CoverArt theme={novel.cover} index={novel.coverIndex} mini className="h-[38px] w-[29px] shrink-0 rounded-[5px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-semibold text-ink">{novel.title}</p>
                <p className="mt-0.5 text-[9.5px] text-ink-muted">{novel.author} · {novel.source}</p>
              </div>
              <span className="text-[10px] text-ink-muted">{[18, 15, 12, 9, 7][index]} 次</span>
              <div className="hidden h-1.5 w-[120px] overflow-hidden rounded-full bg-accent-soft sm:block">
                <div
                  className="h-full rounded-full bg-[#C4B5FB]"
                  style={{ width: `${( [18, 15, 12, 9, 7][index] / 18) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-line pt-3 text-[9.5px] text-ink-muted">
          统计数据为前端生成的演示值，不代表真实下载记录。
        </p>
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value, delta }: { icon: ReactNode; label: string; value: string | number; delta: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">{icon}</span>
        <span className="truncate rounded-full bg-positive-soft px-2 py-[3px] text-[9px] font-medium text-positive">{delta}</span>
      </div>
      <p className="mt-3 truncate text-[20px] font-bold leading-none tracking-[-0.01em] text-ink">{value}</p>
      <p className="mt-1.5 text-[9.5px] text-ink-muted">{label}</p>
    </Card>
  )
}

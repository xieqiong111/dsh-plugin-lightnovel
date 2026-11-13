import type { ReactNode } from 'react'
import { Activity, BookOpen, Download, HardDrive, TrendingUp } from 'lucide-react'
import { Badge, Card, SectionTitle } from '@/components/common/ui'
import { PageHeader } from '@/components/common/PageHeader'
import { CoverArt } from '@/components/novel/CoverArt'
import { novels } from '@/data/mock'
import { cn } from '@/services/utils'

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

export function StatsPage() {
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
              <span className="flex items-center gap-1.5 text-[10px] text-[#A2A2B6]">
                <TrendingUp className="h-3 w-3 text-[#10B981]" />
                共 {total} 次
              </span>
            }
          />
          <div className="mt-8 flex h-[196px] items-end gap-2.5">
            {weekly.map((item, index) => (
              <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[9.5px] font-medium text-[#8B8BA0]">{item.value}</span>
                <div className="relative flex w-full items-end overflow-hidden rounded-t-[8px] bg-[#FBFAFE]" style={{ height: 150 }}>
                  <div
                    className={cn(
                      'w-full rounded-t-[8px] bg-[linear-gradient(180deg,#A78BFA,#7E5EE9)] transition-all duration-700',
                      index === 5 && 'shadow-[0_10px_24px_-12px_rgba(108,74,217,0.8)]',
                    )}
                    style={{ height: `${Math.max(6, (item.value / max) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-[#B5B5C6]">{item.day}</span>
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
              <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white">
                <span className="text-[9px] text-[#A2A2B6]">总下载</span>
                <span className="mt-0.5 text-[20px] font-bold text-[#25263C]">108</span>
              </div>
            </div>
            <div className="flex-1 space-y-2.5">
              {sourcesShare.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 text-[10.5px]">
                  <span className="flex items-center gap-2 text-[#5B5B73]">
                    <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                    {item.name}
                  </span>
                  <span className="font-semibold text-[#8B8BA0]">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <SectionTitle title="热门作品" right={<Badge tone="violet">Top 5</Badge>} />
        <div className="mt-4 space-y-2">
          {novels.slice(0, 5).map((novel, index) => (
            <div key={novel.id} className="flex items-center gap-3 rounded-[10px] px-2 py-2 transition hover:bg-[#FBFAFE]">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  index === 0
                    ? 'bg-[#F1EDFE] text-[#6C4AD9]'
                    : index < 3
                      ? 'bg-[#F7F5FE] text-[#8B7CC8]'
                      : 'bg-[#FAF9FE] text-[#B5B5C6]',
                )}
              >
                {index + 1}
              </span>
              <CoverArt theme={novel.cover} index={novel.coverIndex} mini className="h-[38px] w-[29px] shrink-0 rounded-[5px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-semibold text-[#3F4058]">{novel.title}</p>
                <p className="mt-0.5 text-[9.5px] text-[#A2A2B6]">{novel.author} · {novel.source}</p>
              </div>
              <span className="text-[10px] text-[#A2A2B6]">{[18, 15, 12, 9, 7][index]} 次</span>
              <div className="hidden h-1.5 w-[120px] overflow-hidden rounded-full bg-[#F5F3FB] sm:block">
                <div
                  className="h-full rounded-full bg-[#C4B5FB]"
                  style={{ width: `${( [18, 15, 12, 9, 7][index] / 18) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-[#F5F3FA] pt-3 text-[9.5px] text-[#B5B5C6]">
          统计数据为前端生成的演示值，不代表真实下载记录。
        </p>
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value, delta }: { icon: ReactNode; label: string; value: string; delta: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F6F3FF] text-[#7E5EE9]">{icon}</span>
        <span className="rounded-full bg-[#ECFDF5] px-2 py-[3px] text-[9px] font-medium text-[#0B9E74]">{delta}</span>
      </div>
      <p className="mt-3 text-[20px] font-bold leading-none tracking-[-0.01em] text-[#25263C]">{value}</p>
      <p className="mt-1.5 text-[9.5px] text-[#A2A2B6]">{label}</p>
    </Card>
  )
}

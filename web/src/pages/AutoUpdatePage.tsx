import { BellRing, Clock, Info, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { Badge, Button, Card, EmptyState, SectionTitle } from '@/components/common/ui'
import { PageHeader } from '@/components/common/PageHeader'
import { CoverArt } from '@/components/novel/CoverArt'
import { novels } from '@/data/mock'
import { useToast } from '@/components/common/Toast'

export function AutoUpdatePage() {
  const { toast } = useToast()
  const placeholderRules = novels.slice(1, 4)

  return (
    <div>
      <PageHeader
        eyebrow="Auto update · planned"
        title="自动追更"
        description="按固定周期检查书源更新，并在有新章节时自动创建下载任务。该能力当前仅完成界面占位，插件后端尚未提供调度接口。"
        actions={<Badge tone="amber" className="h-7 px-3">UI 占位 · 不可用</Badge>}
      />

      <Card className="relative mb-5 overflow-hidden border-[#F5E3BE] bg-[linear-gradient(100deg,#FFFBF3,#FDF6E8)] p-6">
        <div className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full border border-[#F3DFB7]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/80 text-[#B4791B] shadow-sm">
            <RefreshCw className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-bold text-[#2B2C44]">自动追更尚未实现</p>
              <Badge tone="amber">Roadmap</Badge>
            </div>
            <p className="mt-1.5 max-w-[720px] text-[10.5px] leading-relaxed text-[#90764A]">
              仓库目前只提供搜索、详情、分卷、下载、任务、书库六个受控工具，没有 cron 调度与差异比对能力。为避免误导，本页控件全部为禁用状态。
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 border-[#F3DFB7] bg-white/70 text-[#B4791B] hover:border-[#EBCF9C] hover:bg-white hover:text-[#B4791B]"
            onClick={() => toast({ tone: 'info', title: '功能规划中', description: '自动追更需要后端调度器与更新差异检测，接入前不会创建真实任务。' })}
          >
            了解规划
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5">
          <SectionTitle title="追更规则" right={<Badge tone="gray">禁用</Badge>} />
          <div className="mt-4 space-y-2.5">
            {placeholderRules.map((novel) => (
              <div
                key={novel.id}
                className="flex items-center gap-3 rounded-[12px] border border-[#EFEDF6] bg-[#FBFAFE] px-3 py-2.5 opacity-80"
              >
                <CoverArt theme={novel.cover} index={novel.coverIndex} mini className="h-[44px] w-[33px] shrink-0 rounded-[6px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-semibold text-[#3F4058]">{novel.title}</p>
                  <p className="mt-0.5 text-[9.5px] text-[#A2A2B6]">每 6 小时检查一次 · 仅下载新增章节</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[#B5B5C6]">未启用</span>
                  <span className="relative h-[18px] w-[32px] rounded-full bg-[#E5E1F1]">
                    <span className="absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white" />
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-[12px] border border-dashed border-[#DCD4F0] bg-white px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F2FF] text-[#8B63F2]">
                <Plus className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[11.5px] font-semibold text-[#3F4058]">新增追更规则</p>
                <p className="mt-0.5 text-[9.5px] text-[#A2A2B6]">需要先选择书目与检查频率</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled
              className="cursor-not-allowed"
              title="后端调度接口尚未实现"
            >
              添加规则
            </Button>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle title="能力清单" className="[&_h2]:text-[17px]" />
            <ul className="mt-3.5 space-y-2.5 text-[10.5px]">
              {[
                ['更新差异检测', false],
                ['定时调度器', false],
                ['新增章节自动下载', false],
                ['更新通知', false],
                ['规则持久化', false],
              ].map(([label, ready]) => (
                <li key={String(label)} className="flex items-center justify-between gap-3 rounded-[9px] bg-[#FBFAFE] px-3 py-2">
                  <span className="text-[#5B5B73]">{label}</span>
                  <span className={ready ? 'text-[#10B981]' : 'text-[#B5B5C6]'}>{ready ? '已实现' : '未实现'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-1.5 text-[9.5px] leading-relaxed text-[#A2A2B6]">
              <Info className="mt-[1px] h-3 w-3 shrink-0 text-[#C4B5FB]" />
              标注为「未实现」的能力不会在 UI 中伪装成可用。
            </p>
          </Card>

          <Card className="p-5">
            <SectionTitle title="通知偏好" className="[&_h2]:text-[17px]" right={<Badge tone="gray">占位</Badge>} />
            <div className="mt-3 space-y-2">
              {[
                { icon: <BellRing className="h-3.5 w-3.5" />, label: '发现更新时通知' },
                { icon: <Clock className="h-3.5 w-3.5" />, label: '每日汇总一次' },
                { icon: <Sparkles className="h-3.5 w-3.5" />, label: '仅关注已入库作品' },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-[9px] border border-[#F1EFF8] px-3 py-2">
                  <span className="flex items-center gap-2 text-[10.5px] text-[#6B6B85]">
                    <span className="text-[#A78BFA]">{row.icon}</span>
                    {row.label}
                  </span>
                  <span className="relative h-[16px] w-[30px] rounded-full bg-[#E5E1F1] opacity-70">
                    <span className="absolute left-[2px] top-[2px] h-[12px] w-[12px] rounded-full bg-white" />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <EmptyState
          icon={<RefreshCw className="h-6 w-6" />}
          title="还没有正在运行的追更任务"
          description="该区域将在后端调度器落地后展示实时运行状态、上次检查时间与失败原因。"
        />
      </Card>
    </div>
  )
}

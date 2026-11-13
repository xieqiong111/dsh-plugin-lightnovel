import { useState } from 'react'
import {
  CheckCircle2,
  Clock3,
  Download,
  Info,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, Progress } from '@/components/common/ui'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { CoverArt } from '@/components/novel/CoverArt'
import { useToast } from '@/components/common/Toast'
import { useTasks, taskStore } from '@/services/taskStore'
import { novelApi } from '@/services/novelApi'
import type { DownloadTask, TaskState } from '@/types'
import { cn } from '@/services/utils'

const tabs: { id: 'all' | TaskState; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'running', label: '进行中' },
  { id: 'queued', label: '排队中' },
  { id: 'completed', label: '已完成' },
  { id: 'failed', label: '失败' },
  { id: 'cancelled', label: '已取消' },
]

const stateMeta: Record<TaskState, { label: string; tone: 'violet' | 'green' | 'amber' | 'rose' | 'gray'; icon: JSX.Element }> = {
  running: { label: '下载中', tone: 'violet', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  queued: { label: '排队中', tone: 'amber', icon: <Clock3 className="h-3 w-3" /> },
  completed: { label: '已完成', tone: 'green', icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { label: '失败', tone: 'rose', icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: '已取消', tone: 'gray', icon: <XCircle className="h-3 w-3" /> },
}

export function TasksPage() {
  const tasks = useTasks()
  const { toast } = useToast()
  const [tab, setTab] = useState<'all' | TaskState>('all')
  const [detail, setDetail] = useState<DownloadTask | null>(null)
  const [cancelTarget, setCancelTarget] = useState<DownloadTask | null>(null)

  const filtered = tab === 'all' ? tasks : tasks.filter((task) => task.state === tab)
  const runningCount = tasks.filter((task) => task.state === 'running').length

  const cancel = async (task: DownloadTask) => {
    await novelApi.cancelTask(task.id)
    setCancelTarget(null)
    setDetail(null)
    toast({ tone: 'warning', title: '任务已取消', description: `${task.title} · 未完成的章节不会写入书库。` })
  }

  const retry = async (task: DownloadTask) => {
    await novelApi.retryTask(task.id)
    toast({ tone: 'info', title: '已重新排队', description: `${task.title} 将从头开始重试。` })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Download queue"
        title="下载任务"
        description="异步任务状态由 Mock 层模拟推进；真实环境应轮询 GET /api/tasks/:taskId 获取 progress.percent 与 artifacts.integrity。"
        actions={
          <>
            <Badge tone="violet" className="h-7 px-3">
              <Download className="h-3 w-3" />
              {runningCount} 个任务进行中
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => toast({ tone: 'info', title: '已刷新任务列表', description: '演示层为本地状态，无需真实轮询。' })}
            >
              刷新
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {tabs.map((item) => {
          const count = item.id === 'all' ? tasks.length : tasks.filter((task) => task.state === item.id).length
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'h-8 rounded-full border px-3.5 text-[11px] transition',
                tab === item.id
                  ? 'border-[#C4B5FB] bg-[#F1EDFE] font-semibold text-[#6C4AD9]'
                  : 'border-[#EDEAF6] bg-white text-[#7A7A92] hover:border-[#DCD4F7] hover:text-[#6C4AD9]',
              )}
            >
              {item.label}
              <span className={cn('ml-1.5 text-[9.5px]', tab === item.id ? 'text-[#8B63F2]' : 'text-[#B5B5C6]')}>{count}</span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Download className="h-6 w-6" />}
            title="该状态下暂无任务"
            description="去搜索页选择一本小说，创建你的第一个 EPUB 下载任务。"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((task) => {
            const meta = stateMeta[task.state]
            return (
              <Card key={task.id} hoverable className="p-5">
                <div className="flex items-start gap-4">
                  <CoverArt
                    theme={task.cover}
                    index={task.coverIndex}
                    mini
                    className="h-[62px] w-[46px] shrink-0 rounded-[8px] shadow-[0_8px_18px_-10px_rgba(43,42,85,0.6)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="truncate text-[13.5px] font-semibold text-[#2B2C44]">{task.title}</p>
                      <Badge tone={meta.tone}>
                        {meta.icon}
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10.5px] text-[#A2A2B6]">
                      任务 {task.id} · {task.volumeLabel} · {task.chapterLabel}
                    </p>
                    {task.message && (
                      <p className="mt-1.5 rounded-[6px] bg-[#FFF5F8] px-2 py-1 text-[9.5px] text-[#C2377B]">{task.message}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[10px]">
                    <span className="text-[#A2A2B6]">
                      {task.state === 'completed' ? '已完成' : task.state === 'failed' ? '已中断' : '进度'}
                      {task.speed && <span className="ml-2 text-[#C4B5FB]">{task.speed}</span>}
                    </span>
                    <span className="font-semibold text-[#6B6B85]">{task.percent}%</span>
                  </div>
                  <Progress
                    value={task.percent}
                    tone={
                      task.state === 'failed'
                        ? 'rose'
                        : task.state === 'completed'
                          ? 'green'
                          : task.state === 'cancelled'
                            ? 'gray'
                            : 'violet'
                    }
                    className="h-[6px]"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#F3F1F9] pt-3">
                  <Button variant="secondary" size="sm" onClick={() => setDetail(task)}>
                    任务详情
                  </Button>
                  {(task.state === 'running' || task.state === 'queued') && (
                    <>
                      {task.state === 'running' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Pause className="h-3 w-3" />}
                          onClick={() => {
                            taskStore.pause(task.id)
                            toast({ tone: 'info', title: '任务已暂停', description: `${task.title} 可在空闲时恢复。` })
                          }}
                        >
                          暂停
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Play className="h-3 w-3" />}
                          onClick={() => taskStore.resume(task.id)}
                        >
                          恢复
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="h-3 w-3" />}
                        className="text-[#C2377B] hover:bg-[#FFF1F5] hover:text-[#C2377B]"
                        onClick={() => setCancelTarget(task)}
                      >
                        取消
                      </Button>
                    </>
                  )}
                  {(task.state === 'failed' || task.state === 'cancelled') && (
                    <Button variant="soft" size="sm" icon={<RotateCcw className="h-3 w-3" />} onClick={() => retry(task)}>
                      重试
                    </Button>
                  )}
                  <span className="ml-auto text-[9.5px] text-[#B5B5C6]">{task.updatedAt}</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="mt-5 flex items-start gap-2 rounded-[12px] border border-[#E9E4FA] bg-[#FBFAFF] px-4 py-3 text-[10.5px] leading-relaxed text-[#8B8BA0]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A78BFA]" />
        <span>
          前端每 2.6 秒推进一次 Mock 进度仅用于演示动效。取消与重试会修改本地 mock 状态，不会调用真实接口（接口仍为待实现）。
        </span>
      </div>

      <TaskDetailModal task={detail} onClose={() => setDetail(null)} />

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        eyebrow="Confirm"
        title="取消这个下载任务？"
        width="max-w-[420px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCancelTarget(null)}>
              保留任务
            </Button>
            <Button variant="danger" size="sm" onClick={() => cancelTarget && cancel(cancelTarget)}>
              确认取消
            </Button>
          </div>
        }
      >
        <div className="px-6 py-5 text-[11.5px] leading-relaxed text-[#6B6B85]">
          <p>
            「{cancelTarget?.title}」当前已完成 <span className="font-semibold text-[#6C4AD9]">{cancelTarget?.percent}%</span>。
            取消后未完成的章节将被丢弃，已生成的临时文件由后端清理。
          </p>
          <p className="mt-2 text-[10px] text-[#A2A2B6]">
            真实实现需在后端二次校验 confirm: true，避免任意路径删除。
          </p>
        </div>
      </Modal>
    </div>
  )
}

function TaskDetailModal({ task, onClose }: { task: DownloadTask | null; onClose: () => void }) {
  return (
    <Modal open={Boolean(task)} onClose={onClose} eyebrow="Task detail" title={task?.title} width="max-w-[560px]">
      {task && (
        <div className="p-6">
          <div className="flex items-start gap-4">
            <CoverArt theme={task.cover} index={task.coverIndex} mini className="h-[92px] w-[68px] rounded-[9px]" />
            <div className="flex-1">
              <Badge tone={stateMeta[task.state].tone}>
                {stateMeta[task.state].icon}
                {stateMeta[task.state].label}
              </Badge>
              <p className="mt-2 text-[11px] leading-relaxed text-[#8B8BA0]">
                {task.volumeLabel} · {task.chapterLabel}
                {task.speed ? ` · ${task.speed}` : ''}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Progress
                  value={task.percent}
                  tone={task.state === 'failed' ? 'rose' : task.state === 'completed' ? 'green' : 'violet'}
                  className="flex-1"
                />
                <span className="text-[11px] font-semibold text-[#6B6B85]">{task.percent}%</span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {[
              ['任务 ID', task.id],
              ['状态', stateMeta[task.state].label],
              ['分卷', task.volumeLabel],
              ['当前章节', task.chapterLabel],
              ['预计大小', task.size ?? '—'],
              ['最近更新', task.updatedAt],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[10px] border border-[#F1EFF8] bg-[#FBFAFE] px-3 py-2.5">
                <p className="text-[9.5px] text-[#A2A2B6]">{label}</p>
                <p className="mt-1 truncate font-mono text-[10.5px] text-[#3F4058]">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[10px] border border-[#EFEDF6] px-3.5 py-3">
            <p className="text-[10px] font-semibold text-[#3F4058]">产物完整性</p>
            <div className="mt-2 flex items-center justify-between text-[10px] text-[#8B8BA0]">
              <span>volume-{task.id}.epub</span>
              <Badge tone={task.state === 'completed' ? 'green' : 'gray'}>
                {task.state === 'completed' ? '校验通过' : '等待生成'}
              </Badge>
            </div>
          </div>

          <p className="mt-3 text-[9.5px] leading-relaxed text-[#B5B5C6]">
            字段对齐 API-CONTRACT.md 中的 state / progress.percent / progress.chaptersDone / artifacts[].integrity。
            当前为 Mock 展示。
          </p>
        </div>
      )}
    </Modal>
  )
}

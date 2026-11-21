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
import { Badge, Button, Card, EmptyState, Progress, Spinner } from '@/components/common/ui'
import { MediaFilterTabs, useMediaFilter } from '@/components/common/MediaFilter'
import { MangaNotice } from '@/components/manga/MangaNotice'
import { MangaTaskCard } from '@/components/manga/MangaTaskCard'
import { useMangaTasks } from '@/hooks/useMangaTasks'
import type { UnifiedDownloadTask } from '@/types/manga'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { CoverArt } from '@/components/novel/CoverArt'
import { useToast } from '@/components/common/Toast'
import { useTasks, taskStore } from '@/services/taskStore'
import { novelApi } from '@/services/novelApi'
import { DEMO, IS_LIVE } from '@/services/runtime'
import type { DownloadTask, TaskState } from '@/types'
import { cn } from '@/services/utils'

type TaskFilter = 'all' | 'unknown' | TaskState

const tabs: { id: TaskFilter; label: string }[] = [
  { id: 'all', label: '全部状态' },
  { id: 'running', label: '进行中' },
  { id: 'queued', label: '排队中' },
  { id: 'completed', label: '已完成' },
  { id: 'failed', label: '失败' },
  { id: 'cancelled', label: '已取消' },
  { id: 'unknown', label: '状态未知' },
]

const stateMeta: Record<TaskState, { label: string; tone: 'violet' | 'green' | 'amber' | 'rose' | 'gray'; icon: JSX.Element }> = {
  running: { label: '下载中', tone: 'violet', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  queued: { label: '排队中', tone: 'amber', icon: <Clock3 className="h-3 w-3" /> },
  completed: { label: '已完成', tone: 'green', icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { label: '失败', tone: 'rose', icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: '已取消', tone: 'gray', icon: <XCircle className="h-3 w-3" /> },
}

export function TasksPage() {
  const novels = useTasks()
  const type = useMediaFilter()
  const mangaTasks = useMangaTasks(type !== 'novel')
  const { toast } = useToast()
  const [tab, setTab] = useState<TaskFilter>('all')
  const [detail, setDetail] = useState<DownloadTask | null>(null)
  const [cancelTarget, setCancelTarget] = useState<DownloadTask | null>(null)

  const tasks: UnifiedDownloadTask[] = [
    ...(type === 'manga' ? [] : novels.map((task): UnifiedDownloadTask => ({ type: 'novel', id: `novel:${task.id}`, task }))),
    ...mangaTasks.queue.map((task): UnifiedDownloadTask => ({ type: 'manga', id: `manga:${task.id}`, task })),
  ]
  const filtered = tab === 'all' ? tasks : tasks.filter(({ task }) => task.state === tab)
  const runningCount = tasks.filter(({ task }) => task.state === 'running').length

  const cancel = async (task: DownloadTask) => {
    try {
      await novelApi.cancelTask(task.id)
      setCancelTarget(null)
      setDetail(null)
      toast({ tone: 'warning', title: '任务已取消', description: `${task.title} · 未完成的章节不会写入书库。` })
    } catch (error) {
      toast({ tone: 'warning', title: '取消失败', description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  const retry = async (task: DownloadTask) => {
    try {
      await novelApi.retryTask(task.id)
      toast({ tone: 'info', title: '已重新排队', description: `${task.title} 将从头开始重试。` })
    } catch (error) {
      toast({ tone: 'warning', title: '重试失败', description: error instanceof Error ? error.message : '未知错误' })
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Download queue"
        title="下载任务"
        description={
          IS_LIVE
            ? '轻小说任务来自插件，漫画进度来自 Suwayomi 下载队列。漫画下载完成后可在详情页确认已下载章节。'
            : '体验 EPUB 下载和漫画章节排队。'
        }
        actions={
          <>
            <Badge tone={IS_LIVE ? 'green' : 'amber'} className="h-7 px-3">
              {IS_LIVE ? <Download className="h-3 w-3" /> : null}
              {!IS_LIVE ? DEMO.label : mangaTasks.error || mangaTasks.loading ? '当前队列部分可用' : `${runningCount} 个任务进行中`}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => {
                if (type !== 'manga') taskStore.refresh()
                if (type !== 'novel') mangaTasks.refresh()
              }}
            >
              刷新
            </Button>
          </>
        }
      />

      <MediaFilterTabs />
      {mangaTasks.error && <div className="mb-4"><MangaNotice message={`漫画下载队列不可用 · ${mangaTasks.error}`} /></div>}
      {mangaTasks.loading && <p role="status" className="mb-3 text-xs text-ink-soft"><Spinner /> 正在读取漫画队列…</p>}

      <div role="group" aria-label="任务状态" className="mb-5 flex flex-wrap items-center gap-2">
        {tabs.map((item) => {
          const count = item.id === 'all' ? tasks.length : tasks.filter(({ task }) => task.state === item.id).length
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'h-8 rounded-full border px-3.5 text-[11px] transition',
                tab === item.id
                  ? 'border-accent-line bg-accent-soft font-semibold text-accent'
                  : 'border-line bg-surface text-ink-soft hover:border-accent-line hover:text-accent',
              )}
            >
              {item.label}
              <span className={cn('ml-1.5 text-[9.5px]', tab === item.id ? 'text-accent' : 'text-ink-muted')}>{count}</span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (!mangaTasks.loading && !mangaTasks.error && (
        <Card>
          <EmptyState
            icon={<Download className="h-6 w-6" />}
            title="该状态下暂无任务"
            description="可在作品详情页选择轻小说卷或漫画章节，提交下载。"
          />
        </Card>
      )) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((entry) => {
            if (entry.type === 'manga') return <MangaTaskCard key={entry.id} id={entry.id} task={entry.task} />
            const task = entry.task
            const meta = stateMeta[task.state]
            return (
              <Card key={entry.id} hoverable className="p-5" data-task-id={entry.id} data-media-type="novel">
                <div className="flex items-start gap-4">
                  <CoverArt
                    theme={task.cover}
                    index={task.coverIndex}
                    mini
                    className="h-[62px] w-[46px] shrink-0 rounded-[8px] shadow-[0_8px_18px_-10px_rgba(43,42,85,0.6)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="truncate text-[13.5px] font-semibold text-ink">{task.title}</p>
                      <Badge tone={meta.tone}>
                        {meta.icon}
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10.5px] text-ink-muted">
                      轻小说 · {entry.id} · {task.volumeLabel} · {task.chapterLabel}
                    </p>
                    {task.message && (
                      <p className="mt-1.5 rounded-[6px] bg-negative-soft px-2 py-1 text-[9.5px] text-negative">{task.message}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[10px]">
                    <span className="text-ink-muted">
                      {task.state === 'completed' ? '已完成' : task.state === 'failed' ? '已中断' : '进度'}
                      {task.speed && <span className="ml-2 text-[#C4B5FB]">{task.speed}</span>}
                    </span>
                    <span className="font-semibold text-ink-soft">{task.percent}%</span>
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

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Button variant="secondary" size="sm" onClick={() => setDetail(task)}>
                    任务详情
                  </Button>
                  {(task.state === 'running' || task.state === 'queued') && (
                    <>
                      {!IS_LIVE && (task.state === 'running' ? (
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
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="h-3 w-3" />}
                        className="text-negative hover:bg-negative-soft hover:text-negative"
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
                  <span className="ml-auto text-[9.5px] text-ink-muted">{task.updatedAt}</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="mt-5 flex items-start gap-2 rounded-[12px] border border-accent-line bg-accent-soft px-4 py-3 text-[10.5px] leading-relaxed text-ink-soft">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <span>
          {IS_LIVE
            ? '轻小说支持取消和重试。漫画列表显示 Suwayomi 当前队列，下载完成的章节可在作品详情页查看。'
            : '演示操作只修改当前页面会话中的样例状态。'}
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
        <div className="px-6 py-5 text-[11.5px] leading-relaxed text-ink-soft">
          <p>
            「{cancelTarget?.title}」当前已完成 <span className="font-semibold text-accent">{cancelTarget?.percent}%</span>。
            取消后未完成的章节将被丢弃，已生成的临时文件由后端清理。
          </p>
            <p className="mt-2 text-[10px] text-ink-muted">
              {IS_LIVE
                ? '后端按任务 ID 取消，不接受文件路径参数，避免任意路径删除。'
                : 'Mock 演示不会修改任何真实任务或文件。'}
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
              <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                {task.volumeLabel} · {task.chapterLabel}
                {task.speed ? ` · ${task.speed}` : ''}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Progress
                  value={task.percent}
                  tone={task.state === 'failed' ? 'rose' : task.state === 'completed' ? 'green' : 'violet'}
                  className="flex-1"
                />
                <span className="text-[11px] font-semibold text-ink-soft">{task.percent}%</span>
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
              <div key={label} className="rounded-[10px] border border-line bg-surface-soft px-3 py-2.5">
                <p className="text-[9.5px] text-ink-muted">{label}</p>
                <p className="mt-1 truncate font-mono text-[10.5px] text-ink">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[10px] border border-line px-3.5 py-3">
            <p className="text-[10px] font-semibold text-ink">产物完整性</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-ink-soft">
              <span className="truncate">{IS_LIVE ? (task.size ? `产物体积 ${task.size}` : '产物路径见书库') : `volume-${task.id}.epub`}</span>
              <Badge tone={task.state === 'completed' ? 'green' : 'gray'}>
                {task.state === 'completed' ? (IS_LIVE ? '已入库' : '校验通过') : '等待生成'}
              </Badge>
            </div>
          </div>

          <p className="mt-3 text-[9.5px] leading-relaxed text-ink-muted">
            {IS_LIVE
              ? '字段来自插件 TaskManager 记录（state / progress.percent / artifacts[].bytes），经 BFF 的 GET /api/tasks 投影，未做任何填充或伪造。'
              : '字段对齐设计契约中的 state / progress.percent / progress.chaptersDone / artifacts[].integrity，当前为 Mock 展示。'}
          </p>
        </div>
      )}
    </Modal>
  )
}

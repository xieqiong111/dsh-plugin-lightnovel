import { Link } from 'react-router-dom'
import { Badge, Button, Card, Progress } from '@/components/common/ui'
import type { MangaTask } from '@/types/manga'

const stateLabels: Record<MangaTask['state'], string> = {
  queued: '排队中', running: '下载中', completed: '已完成', failed: '失败', cancelled: '已取消', unknown: '状态未知',
}

export function MangaTaskCard({ id, task }: { id: string; task: MangaTask }) {
  const tone = task.state === 'failed' ? 'rose' : task.state === 'completed' ? 'green' : task.state === 'queued' ? 'amber' : 'violet'
  const percent = task.percent === null ? null : Math.round(task.percent)

  return (
    <Card className="min-w-0 p-5" hoverable data-task-id={id} data-media-type="manga">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link to={`/manga/${task.mangaId}`} className="min-w-0 break-words text-[13.5px] font-semibold text-[#2B2C44] hover:text-[#6C4AD9]">
          {task.title}
        </Link>
        <Badge tone={tone}>{stateLabels[task.state]}</Badge>
      </div>
      <p className="mt-1 break-words text-[11px] text-[#6B6B85]">漫画 · {task.chapterName} · {id}</p>
      <div className="mt-4 text-[11px] text-[#6B6B85]">
        <p className="mb-1.5 flex justify-between gap-2"><span>Suwayomi · {task.upstreamState}</span><span>{percent === null ? '未报告进度' : `${percent}%`}</span></p>
        {percent !== null && <Progress value={percent} tone={tone === 'amber' ? 'violet' : tone} className="h-1.5" />}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[#F3F1F9] pt-3">
        {['暂停', '恢复', '重试', '取消'].map((label) => <Button key={label} variant="ghost" size="sm" disabled>{label}</Button>)}
        <p className="w-full text-[10.5px] text-[#6B6B85]">本页未接入 Suwayomi 队列控制。</p>
      </div>
    </Card>
  )
}

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Badge, Button, Card, SectionTitle, Spinner } from '@/components/common/ui'
import { MangaNotice } from '@/components/manga/MangaNotice'
import { useAsync } from '@/hooks/useAsync'
import { mangaApi } from '@/services/mangaApi'
import { DEMO } from '@/services/runtime'

function status(value: boolean | null, success: string, failure: string) {
  return value === null ? '未验证' : value ? success : failure
}

export function MangaHealthPanel({ showSources = false }: { showSources?: boolean }) {
  const [attempt, setAttempt] = useState(0)
  const { data, error, loading } = useAsync(() => mangaApi.health(), [attempt])
  const sources = useAsync(() => showSources ? mangaApi.sources() : Promise.resolve(null), [showSources, attempt])

  return (
    <Card className="p-5">
      <SectionTitle title="Suwayomi 健康检查" className="[&_h2]:text-[17px]" right={
        <Button size="sm" aria-label="检查漫画服务" title="检查漫画服务" loading={loading}
          icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setAttempt((value) => value + 1)} />
      } />
      <div className="mt-3 space-y-3">
        <Badge tone="gray">{DEMO.label}</Badge>
        {loading && <p role="status" className="text-xs text-ink-soft"><Spinner /> 正在检查漫画服务…</p>}
        {!loading && (error ? <MangaNotice message={`漫画服务状态不可用 · ${error}`} /> : data && (
          <>
            <dl className="grid gap-x-5 gap-y-2 text-xs text-ink-soft sm:grid-cols-2">
              <div className="flex justify-between gap-4"><dt>Suwayomi 连接</dt><dd>{status(data.reachable, '可达', '不可达')}</dd></div>
              <div className="flex justify-between gap-4"><dt>服务认证</dt><dd>{status(data.authenticated, '已通过', '失败')}</dd></div>
              <div className="flex justify-between gap-4"><dt>GraphQL 兼容</dt><dd>{status(data.compatible, '兼容', '失败')}</dd></div>
              <div className="flex justify-between gap-4"><dt>可用扩展漫画源</dt><dd>{data.installedSources ?? '未验证'}</dd></div>
              <div className="flex justify-between gap-4"><dt>章节读取</dt><dd>{status(data.chapters, '已验证', '失败')}</dd></div>
              {data.version && <div className="flex justify-between gap-4"><dt>服务器版本</dt><dd>{data.version}</dd></div>}
            </dl>
            {data.message && <MangaNotice message={data.message} />}
          </>
        ))}
        {showSources && (
          <div className="border-t border-line pt-3">
            <h3 className="mb-2 text-xs font-semibold text-ink">已启用的漫画源</h3>
            {sources.loading ? <p className="text-xs text-ink-soft"><Spinner /> 正在读取…</p>
              : sources.error ? <MangaNotice message={`漫画源不可用 · ${sources.error}`} />
              : sources.data?.sources.length ? (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {sources.data.sources.map((source) => (
                    <li key={source.id} className="rounded-xl border border-line px-3 py-2 text-xs text-ink-soft">
                      <p className="break-words font-semibold">{source.name}</p>
                      <p className="mt-1 break-all text-[10px]">{source.lang} · ID {source.id}</p>
                    </li>
                  ))}
                </ul>
              ) : <MangaNotice message="请在 Suwayomi 安装并启用漫画源扩展。" />}
          </div>
        )}
      </div>
    </Card>
  )
}

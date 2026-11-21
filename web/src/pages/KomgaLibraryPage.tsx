import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BookOpen, RefreshCw, Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { ApiCover } from '@/components/common/ApiCover'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/common/ui'
import { CoverArt } from '@/components/novel/CoverArt'
import { useAsync } from '@/hooks/useAsync'
import { komgaApi, komgaCoverPath } from '@/services/komgaApi'
import type { KomgaSeries } from '@/services/komgaApi'
import { DEMO, IS_LIVE } from '@/services/runtime'

export function KomgaLibraryPage({ providerTabs }: { providerTabs: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const [input, setInput] = useState(query)
  const [attempt, setAttempt] = useState(0)
  const { data, loading, error } = useAsync(() => komgaApi.libraries(), [attempt])
  const libraries = data?.libraries ?? []
  const libraryId = params.get('library') || libraries[0]?.id || ''
  const available = libraries.some((library) => library.id === libraryId)

  useEffect(() => setInput(query), [query])

  function updateFilter(key: 'q' | 'library', value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return (
    <div className="library-layout">
      <PageHeader
        eyebrow="Komga"
        title="我的书库"
        description="浏览 Komga 已入库的系列、封面和阅读状态。"
        actions={<Badge tone={IS_LIVE ? 'violet' : 'amber'} className="h-7 px-3">{DEMO.label}</Badge>}
      />
      {providerTabs}

      {loading ? (
        <Card className="flex items-center gap-2 p-5 text-sm text-[#6B6B85]" role="status"><Spinner /> 正在读取 Komga 书库…</Card>
      ) : error ? (
        <Card>
          <EmptyState
            icon={<BookOpen />}
            title="Komga 书库不可用"
            description={error}
            action={<Button size="sm" onClick={() => setAttempt((value) => value + 1)} icon={<RefreshCw className="h-3.5 w-3.5" />}>重试连接</Button>}
          />
        </Card>
      ) : !libraries.length ? (
        <Card><EmptyState icon={<BookOpen />} title="暂无可访问的 Komga 书库" description="请检查 Komga 中配置的书库及当前凭据的访问权限。" /></Card>
      ) : (
        <>
          <Card className="mb-4 flex flex-col gap-3 p-4 md:flex-row md:items-end">
            <label className="block min-w-0 md:w-64">
              <span className="mb-1 block text-xs font-medium text-[#6B6B85]">Komga 书库</span>
              <select
                value={libraryId}
                onChange={(event) => updateFilter('library', event.target.value)}
                className="h-10 w-full rounded-xl border border-[#EDEAF6] bg-white px-3 text-sm text-[#33344B]"
              >
                {!available && <option value={libraryId} disabled>原选书库不可用</option>}
                {libraries.map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}
              </select>
            </label>
            <form role="search" className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(event) => {
              event.preventDefault()
              updateFilter('q', input.trim())
            }}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={200}
                placeholder="搜索系列标题…"
                aria-label="搜索 Komga 系列"
                className="h-10 min-w-0 flex-1 rounded-xl border border-[#EDEAF6] bg-[#FBFAFE] px-3 text-sm text-[#33344B]"
              />
              <Button type="submit" variant="soft" icon={<Search className="h-4 w-4" />}>搜索</Button>
            </form>
          </Card>
          {available
            ? <KomgaSeriesGrid key={JSON.stringify([libraryId, query, attempt])} libraryId={libraryId} query={query} />
            : <Card className="p-5 text-sm text-[#6B6B85]" role="status">所选书库不可用，请选择另一书库。</Card>}
        </>
      )}
    </div>
  )
}

function KomgaSeriesGrid({ libraryId, query }: { libraryId: string; query: string }) {
  const [page, setPage] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const { data, loading, error } = useAsync(() => komgaApi.series(libraryId, query, page), [page, attempt])

  if (loading) return <Card className="flex items-center gap-2 p-5 text-sm text-[#6B6B85]" role="status"><Spinner /> 正在读取 Komga 系列…</Card>
  if (error) return (
    <Card><EmptyState icon={<BookOpen />} title="Komga 系列读取失败" description={error}
      action={<Button size="sm" onClick={() => setAttempt((value) => value + 1)}>重试</Button>} /></Card>
  )
  if (!data) return null

  return (
    <section aria-label="Komga 系列">
      {data.content.length ? (
        <>
          <p className="mb-3 text-xs text-[#6B6B85]">{data.page.totalElements} 个系列</p>
          <div className="library-cover-grid grid">
            {data.content.map((series) => <KomgaSeriesCard key={series.id} series={series} />)}
          </div>
        </>
      ) : (
        <Card><EmptyState icon={<BookOpen />} title={query ? '没有匹配的 Komga 系列' : '这个 Komga 书库暂无系列'} /></Card>
      )}
      {(page > 0 || !data.page.last) && (
        <nav aria-label="Komga 系列分页" className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button size="sm" disabled={data.page.first} onClick={() => setPage((value) => value - 1)}>上一页</Button>
          <span className="text-xs text-[#6B6B85]">第 {data.page.number + 1} 页</span>
          <Button size="sm" disabled={data.page.last} onClick={() => setPage((value) => value + 1)}>下一页</Button>
        </nav>
      )}
    </section>
  )
}

function KomgaSeriesCard({ series }: { series: KomgaSeries }) {
  const coverClass = 'aspect-[3/4] w-full rounded-[11px]'
  return (
    <Card className="min-w-0 overflow-hidden p-[6px]" hoverable data-komga-series={series.id}>
      {IS_LIVE ? <ApiCover path={komgaCoverPath(series.id)} title={series.title} className={coverClass} />
        : series.mockCover && <CoverArt theme={series.mockCover} index={0} title={series.title} media="manga" className={coverClass} />}
      <div className="space-y-1.5 px-2 pb-2 pt-3">
        <h3 className="break-words text-[13px] font-bold text-[#2B2C44]">{series.title}</h3>
        <p className="text-xs text-[#6B6B85]">{series.booksCount} 本 · 已读 {series.booksReadCount}</p>
        {series.summary && <p className="line-clamp-2 break-words text-[11px] leading-relaxed text-[#6B6B85]">{series.summary}</p>}

      </div>
    </Card>
  )
}

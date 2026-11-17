import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { MangaCard } from '@/components/manga/MangaCard'
import { MangaNotice } from '@/components/manga/MangaNotice'
import { Button, Card, EmptyState, SectionTitle, Spinner } from '@/components/common/ui'
import { useAsync } from '@/hooks/useAsync'
import { mangaApi } from '@/services/mangaApi'
import { IS_LIVE } from '@/services/runtime'
import type { Manga, MangaSource } from '@/types/manga'

export function MangaSearchResults({ keyword, attempt }: { keyword: string; attempt: number }) {
  const { data, loading, error } = useAsync(() => mangaApi.sources(), [attempt])
  const [sourceId, setSourceId] = useState('')
  const sources = error ? [] : data?.sources ?? []
  const hasQuery = !IS_LIVE || Boolean(keyword.trim())

  return (
    <section className="mt-6 space-y-3" aria-label="漫画搜索结果">
      <SectionTitle
        title="漫画"
        right={
          <select
            aria-label="漫画源"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            className="max-w-[60%] rounded-full border border-[#EDEAF6] bg-white px-3 py-2 text-xs text-[#5B5B73]"
          >
            <option value="">全部漫画源</option>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.lang}</option>)}
          </select>
        }
      />
      {!loading && sources.length > 0 && sources.every((source) => source.id === '0') && (
        <MangaNotice message="尚未安装漫画源扩展。当前可搜索 Suwayomi 本地漫画。" />
      )}
      {loading ? <p className="text-xs text-[#6B6B85]"><Spinner /> 正在读取漫画源…</p>
        : error ? <MangaNotice message={`漫画源不可用 · ${error}`} />
        : !sources.length ? <MangaNotice message="没有可搜索的漫画源。请在 Suwayomi 安装并启用漫画源扩展。" />
        : !hasQuery ? <p className="text-xs text-[#6B6B85]">输入漫画标题开始搜索。</p>
        : <MangaResultList key={JSON.stringify([keyword, sourceId, attempt])} query={keyword} sourceId={sourceId} sources={sources} />}
    </section>
  )
}

function MangaResultList({ query, sourceId, sources }: { query: string; sourceId: string; sources: MangaSource[] }) {
  const [position, setPosition] = useState<{ page: number; offset: number; resultId?: string }>({ page: 1, offset: 0 })
  const [mangas, setMangas] = useState<Manga[]>([])
  const [hasNextPage, setHasNextPage] = useState(false)
  const { data, loading, error } = useAsync(
    () => mangaApi.search(query, sourceId, position.page, position.offset, position.resultId),
    [position],
  )

  useEffect(() => {
    if (!data || loading || error) return
    setMangas((previous) => {
      const items = new Map(previous.map((manga) => [`${manga.sourceId}:${manga.id}`, manga]))
      for (const manga of data.mangas) items.set(`${manga.sourceId}:${manga.id}`, manga)
      return [...items.values()]
    })
    setHasNextPage(data.hasNextPage)
  }, [data, error, loading])

  return (
    <>
      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <MangaNotice message={`漫画搜索失败 · ${error}`} />
          <Button size="sm" loading={loading} onClick={() => {
            setMangas([])
            setHasNextPage(false)
            setPosition({ page: 1, offset: 0 })
          }}>重新搜索漫画</Button>
        </div>
      )}
      {!error && data?.truncated && <MangaNotice message="源站本页结果超出安全上限。可用更具体的标题缩小范围。" />}
      {!error && data?.errors?.map((failure) => (
        <MangaNotice key={failure.sourceId} message={`${sources.find((source) => source.id === failure.sourceId)?.name ?? failure.sourceId} · ${failure.message}`} />
      ))}
      {mangas.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {mangas.map((manga) => <MangaCard key={`${manga.sourceId}:${manga.id}`} manga={manga} />)}
        </div>
      )}
      {loading && <p role="status" className="text-xs text-[#6B6B85]"><Spinner /> 正在搜索漫画…</p>}
      {!loading && !error && mangas.length === 0 && (
        <Card><EmptyState icon={<BookOpen />} title="没有找到匹配的漫画" description="可尝试其他标题、别名或漫画源。" /></Card>
      )}
      {!loading && !error && hasNextPage && (
        <Button size="sm" onClick={() => {
          const nextOffset = data?.nextOffset
          setPosition(nextOffset == null
            ? { page: position.page + 1, offset: 0 }
            : { page: position.page, offset: nextOffset, resultId: data?.resultId ?? undefined })
        }}>更多漫画结果</Button>
      )}
    </>
  )
}

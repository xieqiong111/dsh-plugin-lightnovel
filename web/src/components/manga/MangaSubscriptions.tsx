import { BookMarked } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, SectionTitle, Spinner } from '@/components/common/ui'
import { MangaNotice } from '@/components/manga/MangaNotice'
import { mangaSource } from '@/components/manga/MangaCard'
import { useMangaLibrary } from '@/hooks/useMangaLibrary'
import { DEMO } from '@/services/runtime'

export function MangaSubscriptions() {
  const { mangas, loading, error, hasMore, loadMore, retry } = useMangaLibrary()

  return (
    <Card className="mb-5 p-5">
      <SectionTitle title="漫画订阅" right={<Badge tone="gray">{DEMO.label}</Badge>} />
      <p className="mb-4 mt-2 text-xs leading-relaxed text-ink-soft">追更范围来自 Suwayomi 书架。实际更新频率、分类规则和下载行为由 Suwayomi 设置决定。</p>
      {error && (
        <div className="flex flex-wrap gap-2">
          <MangaNotice message={`漫画订阅不可用 · ${error}`} />
          <Button size="sm" onClick={retry}>重试</Button>
        </div>
      )}
      {mangas.length > 0 && (
        <ul className="divide-y divide-line">
          {mangas.map((manga) => (
            <li key={manga.id}>
              <Link to={`/manga/${manga.id}`} className="flex items-center justify-between gap-3 py-3 text-xs hover:text-accent">
                <span className="min-w-0">
                  <strong className="block truncate">{manga.title}</strong>
                  <span className="mt-1 block truncate text-ink-soft">{mangaSource(manga)}</span>
                </span>
                <Badge tone={manga.subscribed ? 'green' : 'gray'}>{manga.subscribed ? '已订阅' : '已在书架'}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && !mangas.length && <EmptyState icon={<BookMarked />} title="暂无漫画订阅" description="在漫画详情页可订阅追更。" />}
      {loading && <p role="status" className="text-xs text-ink-soft"><Spinner /> 正在读取订阅…</p>}
      {hasMore && <Button size="sm" loading={loading} onClick={loadMore}>加载更多漫画</Button>}
    </Card>
  )
}

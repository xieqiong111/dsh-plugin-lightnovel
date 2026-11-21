import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowUpDown,
  BookOpen,
  Download,
  FileText,
  FolderOpen,
  Grid3X3,
  List,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconTile, Spinner } from '@/components/common/ui'
import { Modal } from '@/components/common/Modal'
import { MediaFilterTabs, useMediaFilter } from '@/components/common/MediaFilter'
import { MangaCard, MangaCover, mangaDate, mangaSource } from '@/components/manga/MangaCard'
import { MangaNotice } from '@/components/manga/MangaNotice'
import { KomgaLibraryPage } from '@/pages/KomgaLibraryPage'
import { useMangaLibrary } from '@/hooks/useMangaLibrary'
import type { UnifiedLibraryItem } from '@/types/manga'
import { PageHeader } from '@/components/common/PageHeader'
import { CoverArt } from '@/components/novel/CoverArt'
import { useToast } from '@/components/common/Toast'
import { library as mockLibrary } from '@/data/mock'
import { novelApi } from '@/services/novelApi'
import { DEMO, IS_LIVE } from '@/services/runtime'
import type { LibraryItem, LibraryStats } from '@/types'
import { cn, formatBytes } from '@/services/utils'

function libraryAddedAt(entry: UnifiedLibraryItem) {
  return (entry.type === 'novel' ? entry.item.createdAt : entry.item.addedAt) ?? ''
}

type Integrity = LibraryItem['integrity']
type SortKey = 'recent' | 'name' | 'size'

const integrityMeta: Record<Integrity, { label: string; tone: 'violet' | 'amber' | 'rose' }> = {
  passed: { label: '校验通过', tone: 'violet' },
  pending: { label: '待校验', tone: 'amber' },
  failed: { label: '校验失败', tone: 'rose' },
}

export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('provider') === 'komga' ? 'komga' : 'studio'
  const providers = [['studio', 'Studio 书库'], ['komga', 'Komga']] as const
  const providerTabs = (
    <div role="group" aria-label="书库来源" className="mb-4 flex w-fit rounded-full border border-line bg-surface p-1">
      {providers.map(([provider, label]) => (
        <button
          key={provider}
          type="button"
          aria-pressed={provider === selected}
          className={cn('h-8 rounded-full px-4 text-xs transition', provider === selected
            ? 'bg-accent-soft font-semibold text-accent'
            : 'text-ink-soft hover:text-accent')}
          onClick={() => {
            if (provider === selected) return
            const next = new URLSearchParams(params)
            if (provider === 'komga') next.set('provider', provider)
            else next.delete('provider')
            setParams(next)
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
  return selected === 'komga'
    ? <KomgaLibraryPage providerTabs={providerTabs} />
    : <StudioLibraryPage providerTabs={providerTabs} />
}

function StudioLibraryPage({ providerTabs }: { providerTabs: ReactNode }) {
  const { toast } = useToast()
  const type = useMediaFilter()
  const mangaLibrary = useMangaLibrary(type !== 'novel')
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<'all' | Integrity>('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [items, setItems] = useState<LibraryItem[]>(IS_LIVE ? [] : mockLibrary)
  const [stats, setStats] = useState<LibraryStats | null>(null)
  const [detail, setDetail] = useState<LibraryItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LibraryItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = async (query = keyword) => {
    const [list, overview] = await Promise.all([novelApi.listLibrary(query), novelApi.getLibraryStats()])
    setItems(list)
    setStats(overview)
  }

  useEffect(() => {
    if (type === 'manga') return
    void refresh(keyword).catch(() => {
      /* keep last known snapshot; the empty state explains a cold/empty library */
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, type])

  const visibleNovels = useMemo(() => {
    const filtered = filter === 'all' ? items : items.filter((item) => item.integrity === filter)
    const sorted = [...filtered]
    if (sort === 'name') sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    if (sort === 'size') sorted.sort((a, b) => parseFloat(b.size) - parseFloat(a.size))
    return sorted
  }, [items, filter, sort])

  const query = keyword.trim().toLocaleLowerCase()
  const visible: UnifiedLibraryItem[] = [
    ...(type === 'manga' ? [] : visibleNovels.map((item): UnifiedLibraryItem => ({
      type: 'novel', id: `novel:${item.id}`, format: 'EPUB', item,
    }))),
    ...mangaLibrary.mangas
      .filter((item) => [item.title, item.author ?? '', mangaSource(item)].some((value) => value.toLocaleLowerCase().includes(query)))
      .map((item): UnifiedLibraryItem => ({ type: 'manga', id: `manga:${item.id}`, format: 'Suwayomi 章节', item })),
  ]
  if (sort === 'name') visible.sort((a, b) => a.item.title.localeCompare(b.item.title, 'zh-Hans-CN'))
  if (sort === 'recent' || (sort === 'size' && type === 'manga')) {
    visible.sort((a, b) => libraryAddedAt(b).localeCompare(libraryAddedAt(a)))
  }

  const verify = async (item: LibraryItem) => {
    setBusy(item.id)
    try {
      const result = await novelApi.verifyFile(item.id)
      setItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, integrity: result.integrity } : entry)),
      )
      if (result.ok) {
        toast({ tone: 'success', title: '完整性校验通过', description: `${item.fileName} · SHA-256 与清单一致。` })
      } else {
        toast({ tone: 'warning', title: '校验未通过', description: result.problems?.join('；') || '文件与清单不一致。' })
      }
      void refresh().catch(() => {})
    } catch (error) {
      toast({ tone: 'warning', title: '校验失败', description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setBusy(null)
    }
  }

  const download = async (item: LibraryItem) => {
    setBusy(item.id)
    try {
      await novelApi.downloadFile(item.id, item.fileName)
      toast({ tone: 'success', title: '已开始下载', description: item.fileName })
    } catch (error) {
      toast({ tone: 'warning', title: '下载不可用', description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (item: LibraryItem) => {
    setBusy(item.id)
    try {
      await novelApi.deleteFile(item.id)
      setItems((prev) => prev.filter((entry) => entry.id !== item.id))
      setDeleteTarget(null)
      setDetail(null)
      toast({ tone: 'success', title: '已从书库移除', description: item.fileName })
      void refresh().catch(() => {})
    } catch (error) {
      toast({ tone: 'warning', title: '删除失败', description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="library-layout">
      <PageHeader
        eyebrow="Local library"
        title="我的书库"
        description={
          IS_LIVE
            ? '查看已入库的 EPUB 和 Suwayomi 漫画。可校验 EPUB 文件，也可进入漫画详情管理章节。'
            : '查看样例 EPUB 和漫画。'
        }
        actions={
          <>
            <Badge tone={IS_LIVE ? 'green' : 'amber'} className="h-7 px-3">{DEMO.label}</Badge>
            {type !== 'manga' && <Button
              variant="secondary"
              size="sm"
              icon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => toast({ tone: 'warning', title: '导入功能尚未实现', description: 'BFF 暂不提供 /api/library/import，暂不支持上传本地 EPUB。' })}
            >
              导入 EPUB
            </Button>}
            <div className="inline-flex rounded-full border border-line bg-surface p-1">
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-label="网格视图"
                className={cn('flex h-7 w-8 items-center justify-center rounded-full transition', view === 'grid' ? 'bg-accent-soft text-accent' : 'text-ink-muted')}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('table')}
                aria-label="列表视图"
                className={cn('flex h-7 w-8 items-center justify-center rounded-full transition', view === 'table' ? 'bg-accent-soft text-accent' : 'text-ink-muted')}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-3">{providerTabs}<MediaFilterTabs /></div>

      {type !== 'manga' && <div className="library-stats mb-5 grid gap-3">
        <MiniStat icon={<BookOpen className="h-4 w-4" />} value={stats?.epubs ?? items.length} label="EPUB 文件" />
        <MiniStat icon={<FolderOpen className="h-4 w-4" />} value={items.length} label={IS_LIVE ? '当前列表' : '样例文件'} />
        <MiniStat icon={<ShieldCheck className="h-4 w-4" />} value={stats?.verified ?? items.filter((item) => item.integrity === 'passed').length} label="通过校验" />
        <MiniStat icon={<FileText className="h-4 w-4" />} value={stats?.bytes !== undefined ? formatBytes(stats.bytes) : '—'} label="占用空间" />
      </div>}

      <Card className="library-toolbar mb-5 flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <div className="library-search flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line bg-surface-soft px-3 sm:px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-muted" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索标题或文件名…"
            aria-label="搜索书库"
            className="h-full min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-muted focus:outline-none"
          />
        </div>

        <div className="library-filters flex min-w-0 flex-wrap items-center gap-2">
          {type !== 'manga' && <div role="group" aria-label="EPUB 完整性" className="inline-flex max-w-full flex-wrap rounded-full border border-line bg-surface p-1">
            {(
              [
                ['all', '全部校验状态'],
                ['passed', '通过'],
                ['pending', '待校验'],
                ['failed', '失败'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  'h-8 whitespace-nowrap rounded-full px-2.5 text-[11px] transition sm:px-3',
                  filter === id ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-soft hover:text-accent',
                )}
              >
                {label}
              </button>
            ))}
          </div>}

          <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5">
            <ArrowUpDown className="h-3 w-3 text-ink-muted" />
            <select
              value={type === 'manga' && sort === 'size' ? 'recent' : sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="排序方式"
              className="bg-transparent text-[10.5px] text-ink-soft focus:outline-none"
            >
              <option value="recent">最近添加</option>
              <option value="name">按书名</option>
              {type !== 'manga' && <option value="size">按 EPUB 体积</option>}
            </select>
          </div>
          <span className="text-[10px] text-ink-muted">{visible.length} 项</span>
        </div>
      </Card>

      {mangaLibrary.error && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MangaNotice message={`漫画书架不可用 · ${mangaLibrary.error}`} />
          <Button size="sm" onClick={mangaLibrary.retry}>重试漫画书架</Button>
        </div>
      )}
      {mangaLibrary.loading && <p role="status" className="mb-3 text-xs text-ink-soft"><Spinner /> 正在读取漫画书架…</p>}

      {visible.length === 0 ? (!mangaLibrary.loading && !mangaLibrary.error && (
        <Card>
          <EmptyState
            icon={<FolderOpen className="h-6 w-6" />}
            title="书库中暂无匹配资源"
            description="可以调整筛选条件，或在搜索发现中选择作品。"
            action={
              <Button variant="soft" size="sm" onClick={() => { setKeyword(''); setFilter('all') }}>
                清空筛选
              </Button>
            }
          />
        </Card>
      )) : view === 'grid' ? (
        <div className="library-cover-grid grid">
          {visible.map((entry) => {
            if (entry.type === 'manga') return <MangaCard key={entry.id} manga={entry.item} library />
            const item = entry.item
            return (
            <Card key={entry.id} data-media-type="novel" data-resource-id={item.id} hoverable className="flex min-w-0 flex-col overflow-hidden p-[6px]">
              <CoverArt
                theme={item.cover}
                index={item.coverIndex}
                title={item.title}
                className="aspect-[3/4] w-full rounded-[11px]"
              />
              <div className="flex flex-1 flex-col px-2 pb-2 pt-3">
                <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
                  <h3 title={item.title} className="min-w-0 flex-[1_1_7rem] break-words text-[13px] font-bold leading-snug text-ink">{item.title}</h3>
                  <Badge className="shrink-0 whitespace-nowrap" tone={integrityMeta[item.integrity].tone}>{integrityMeta[item.integrity].label}</Badge>
                </div>
                <p className="mt-1 truncate text-[9.5px] text-ink-muted">{item.fileName}</p>
                <p className="mt-2 break-words text-[10px] text-ink-soft">轻小说 · {entry.format} · {item.novelId.split(':')[0]}</p>
                <p className="mt-1 break-words text-[10px] text-ink-soft">已下载 · 入库 {item.addedAt} · ID {item.id}</p>
                <p className="mt-1 text-[10px] text-ink-muted">{item.volumeLabel} · {item.size}</p>
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
                  <Button variant="soft" size="sm" className="h-8 flex-[1_0_3rem] px-2 text-[11px]" onClick={() => setDetail(item)}>
                    详情
                  </Button>
                  <button
                    type="button"
                    aria-label="校验文件"
                    onClick={() => verify(item)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-accent-soft hover:text-accent"
                  >
                    <ShieldCheck className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="删除文件"
                    onClick={() => setDeleteTarget(item)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-negative-soft hover:text-negative"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </Card>
            )
          })}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-[minmax(0,1.7fr)_120px_80px_110px_110px_120px] gap-3 border-b border-line bg-surface-soft px-5 py-3 text-[10px] text-ink-muted">
            <span>资源</span>
            <span>卷数 / 章节</span>
            <span>格式</span>
            <span>状态</span>
            <span>时间</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-line">
            {visible.map((entry) => {
              if (entry.type === 'manga') {
                const manga = entry.item
                return (
                  <Link key={entry.id} to={`/manga/${manga.id}`} data-media-type="manga" data-resource-id={manga.id}
                    className="grid min-w-[700px] grid-cols-[minmax(0,1.7fr)_120px_80px_110px_110px_120px] items-center gap-3 px-5 py-3 text-[10.5px] text-ink-soft hover:bg-surface-soft">
                    <span className="flex min-w-0 items-center gap-3">
                      <MangaCover manga={manga} className="h-10 w-[31px] shrink-0 rounded-[6px]" />
                      <span className="min-w-0">
                        <strong className="block truncate text-ink">{manga.title}</strong>
                        <span className="block truncate">漫画 · {mangaSource(manga)} · ID {manga.id}</span>
                      </span>
                    </span>
                    <span>{manga.chapterCount ?? '—'}</span><span>{entry.format}</span>
                    <span>{manga.downloadCount === null ? '状态未知' : `已下载 ${manga.downloadCount} 章`}</span>
                    <span>{mangaDate(manga.updatedAt)}</span><span className="text-right text-accent">详情</span>
                  </Link>
                )
              }
              const item = entry.item
              return (
              <div
                key={entry.id}
                data-media-type="novel"
                data-resource-id={item.id}
                className="grid min-w-[700px] grid-cols-[minmax(0,1.7fr)_120px_80px_110px_110px_120px] items-center gap-3 px-5 py-3 transition hover:bg-surface-soft"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CoverArt theme={item.cover} index={item.coverIndex} mini className="h-[40px] w-[31px] shrink-0 rounded-[6px]" />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-ink">{item.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[9px] text-ink-muted">{item.fileName}</p>
                    <p className="truncate text-[10px]">轻小说 · {item.novelId.split(':')[0]} · ID {item.id}</p>
                  </div>
                </div>
                <span className="truncate text-[10.5px] text-ink-soft">{item.volumeLabel}</span>
                <span className="text-[10.5px] text-ink-soft">{entry.format} · {item.size}</span>
                <span>
                  <Badge tone={integrityMeta[item.integrity].tone}>{integrityMeta[item.integrity].label}</Badge>
                </span>
                <span className="text-[10px] text-ink-muted">{item.addedAt}</span>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => verify(item)}
                    className="rounded-full px-2 py-1 text-[10px] text-accent transition hover:bg-accent-soft"
                  >
                    校验
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetail(item)}
                    className="rounded-full px-2 py-1 text-[10px] text-ink-soft transition hover:bg-accent-soft hover:text-accent"
                  >
                    详情
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="rounded-full px-2 py-1 text-[10px] text-negative transition hover:bg-negative-soft"
                  >
                    删除
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        </Card>
      )}

      {mangaLibrary.hasMore && <Button size="sm" className="mt-4" loading={mangaLibrary.loading} onClick={mangaLibrary.loadMore}>加载更多漫画</Button>}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        eyebrow="EPUB file"
        title={detail?.title}
        width="max-w-[560px]"
      >
        {detail && (
          <div className="p-6">
            <div className="flex gap-4">
              <CoverArt theme={detail.cover} index={detail.coverIndex} className="h-[122px] w-[91px] rounded-[10px]" />
              <div className="min-w-0 flex-1">
                <Badge tone={integrityMeta[detail.integrity].tone}>{integrityMeta[detail.integrity].label}</Badge>
                <p className="mt-2 break-all font-mono text-[10px] text-ink-soft">{detail.fileName}</p>
                <p className="mt-3 text-[10.5px] leading-relaxed text-ink-muted">
                  {detail.volumeLabel} · {detail.size} · 添加于 {detail.addedAt}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {detail.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-accent-soft px-2 py-0.5 text-[9.5px] text-accent">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2 rounded-[12px] bg-surface-soft p-4 text-[10px]">
              {[
                ['文件 ID', detail.id],
                ['大小', detail.size],
                ['完整性', integrityMeta[detail.integrity].label],
                ['来源任务', `task_${detail.id.replace('lib_', '')}`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-ink-muted">{label}</span>
                  <span className="font-mono text-ink-soft">{value}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" icon={<ShieldCheck className="h-3.5 w-3.5" />} loading={busy === detail.id} onClick={() => verify(detail)}>
                校验完整性
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="h-3.5 w-3.5" />}
                loading={busy === detail.id}
                onClick={() => download(detail)}
              >
                下载 EPUB
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                onClick={() => toast({ tone: 'info', title: '打开目录为占位', description: '浏览器无法直接访问服务器文件系统，请使用「下载 EPUB」。' })}
              >
                打开目录
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        eyebrow="Destructive action"
        title="删除这个 EPUB 文件？"
        width="max-w-[440px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              loading={busy === deleteTarget?.id}
              onClick={() => {
                if (!deleteTarget) return
                if (IS_LIVE) {
                  void remove(deleteTarget)
                } else {
                  setDeleteTarget(null)
                  setDetail(null)
                  toast({ tone: 'warning', title: '演示模式：未真正删除', description: '切换到 live 模式后由 DELETE /api/library/:id 处理（需服务端开启）。' })
                }
              }}
            >
              确认删除
            </Button>
          </div>
        }
      >
        <div className="px-6 py-5 text-[11.5px] leading-relaxed text-ink-soft">
          {IS_LIVE
            ? `将调用 DELETE /api/library/:id 移除「${deleteTarget?.fileName}」的索引与磁盘文件。该操作需在服务端设置 LN_BFF_ALLOW_DELETE=true，未开启时会返回 403。`
            : `将从书库移除「${deleteTarget?.fileName}」。演示环境不会修改磁盘文件，仅关闭弹窗并提示。`}
        </div>
      </Modal>
    </div>
  )
}

function MiniStat({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value: number | string
  label: string
}) {
  return (
    <Card className="flex min-w-0 items-center gap-2 p-3 sm:gap-3 sm:p-4">
      <IconTile className="h-9 w-9 shrink-0 bg-accent-soft">{icon}</IconTile>
      <div className="min-w-0">
        <p className="text-[16px] font-bold leading-none text-ink">
          {value}
        </p>
        <p className="mt-1 break-words text-[10.5px] text-ink-muted">{label}</p>
      </div>
    </Card>
  )
}

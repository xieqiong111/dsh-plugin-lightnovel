import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
    <div>
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
            <div className="inline-flex rounded-full border border-[#EDEAF6] bg-white p-1">
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-label="网格视图"
                className={cn('flex h-7 w-8 items-center justify-center rounded-full transition', view === 'grid' ? 'bg-[#F1EDFE] text-[#6C4AD9]' : 'text-[#A2A2B6]')}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('table')}
                aria-label="列表视图"
                className={cn('flex h-7 w-8 items-center justify-center rounded-full transition', view === 'table' ? 'bg-[#F1EDFE] text-[#6C4AD9]' : 'text-[#A2A2B6]')}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        }
      />

      <MediaFilterTabs />

      {type !== 'manga' && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat icon={<BookOpen className="h-4 w-4" />} value={stats?.epubs ?? items.length} label="EPUB 文件" />
        <MiniStat icon={<FolderOpen className="h-4 w-4" />} value={items.length} label={IS_LIVE ? '当前列表' : '样例文件'} />
        <MiniStat icon={<ShieldCheck className="h-4 w-4" />} value={stats?.verified ?? items.filter((item) => item.integrity === 'passed').length} label="通过校验" />
        <MiniStat icon={<FileText className="h-4 w-4" />} value={stats?.bytes !== undefined ? formatBytes(stats.bytes) : '—'} label="占用空间" />
      </div>}

      <Card className="mb-5 flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex h-10 flex-1 items-center gap-2.5 rounded-full border border-[#EFEDF6] bg-[#FBFAFE] px-4 lg:max-w-[380px]">
          <Search className="h-4 w-4 shrink-0 text-[#A6A6B8]" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索标题或文件名…"
            aria-label="搜索书库"
            className="h-full min-w-0 flex-1 bg-transparent text-[12px] text-[#33344B] placeholder:text-[#ADADC0] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {type !== 'manga' && <div role="group" aria-label="EPUB 完整性" className="inline-flex rounded-full border border-[#EDEAF6] bg-white p-1">
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
                onClick={() => setFilter(id)}
                className={cn(
                  'h-7 rounded-full px-3 text-[10.5px] transition',
                  filter === id ? 'bg-[#F1EDFE] font-semibold text-[#6C4AD9]' : 'text-[#8B8BA0] hover:text-[#6C4AD9]',
                )}
              >
                {label}
              </button>
            ))}
          </div>}

          <div className="flex items-center gap-1.5 rounded-full border border-[#EDEAF6] bg-white px-3 py-1.5">
            <ArrowUpDown className="h-3 w-3 text-[#A6A6B8]" />
            <select
              value={type === 'manga' && sort === 'size' ? 'recent' : sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="排序方式"
              className="bg-transparent text-[10.5px] text-[#6B6B85] focus:outline-none"
            >
              <option value="recent">最近添加</option>
              <option value="name">按书名</option>
              {type !== 'manga' && <option value="size">按 EPUB 体积</option>}
            </select>
          </div>
          <span className="text-[10px] text-[#B5B5C6]">{visible.length} 项</span>
        </div>
      </Card>

      {mangaLibrary.error && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MangaNotice message={`漫画书架不可用 · ${mangaLibrary.error}`} />
          <Button size="sm" onClick={mangaLibrary.retry}>重试漫画书架</Button>
        </div>
      )}
      {mangaLibrary.loading && <p role="status" className="mb-3 text-xs text-[#6B6B85]"><Spinner /> 正在读取漫画书架…</p>}

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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((entry) => {
            if (entry.type === 'manga') return <MangaCard key={entry.id} manga={entry.item} library />
            const item = entry.item
            return (
            <Card key={entry.id} data-media-type="novel" data-resource-id={item.id} hoverable className="overflow-hidden p-[6px]">
              <CoverArt
                theme={item.cover}
                index={item.coverIndex}
                title={item.title}
                className="aspect-[3/4] w-full rounded-[11px]"
              />
              <div className="px-2 pb-2 pt-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[12.5px] font-bold text-[#2B2C44]">{item.title}</p>
                  <Badge tone={integrityMeta[item.integrity].tone}>{integrityMeta[item.integrity].label}</Badge>
                </div>
                <p className="mt-1 truncate text-[9.5px] text-[#A2A2B6]">{item.fileName}</p>
                <p className="mt-2 break-words text-[10px] text-[#6B6B85]">轻小说 · {entry.format} · {item.novelId.split(':')[0]}</p>
                <p className="mt-1 break-words text-[10px] text-[#6B6B85]">已下载 · 入库 {item.addedAt} · ID {item.id}</p>
                <p className="mt-1 text-[10px] text-[#8F8FA4]">{item.volumeLabel} · {item.size}</p>
                <div className="mt-3 flex items-center gap-1.5">
                  <Button variant="soft" size="sm" className="h-7 flex-1 px-2 text-[10px]" onClick={() => setDetail(item)}>
                    详情
                  </Button>
                  <button
                    type="button"
                    aria-label="校验文件"
                    onClick={() => verify(item)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[#8B8BA0] transition hover:bg-[#F1EDFE] hover:text-[#6C4AD9]"
                  >
                    <ShieldCheck className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="删除文件"
                    onClick={() => setDeleteTarget(item)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[#B5B5C6] transition hover:bg-[#FFF1F5] hover:text-[#C2377B]"
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
          <div className="grid min-w-[700px] grid-cols-[minmax(0,1.7fr)_120px_80px_110px_110px_120px] gap-3 border-b border-[#F3F1F9] bg-[#FBFAFE] px-5 py-3 text-[10px] text-[#9C9CB0]">
            <span>资源</span>
            <span>卷数 / 章节</span>
            <span>格式</span>
            <span>状态</span>
            <span>时间</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-[#F6F4FB]">
            {visible.map((entry) => {
              if (entry.type === 'manga') {
                const manga = entry.item
                return (
                  <Link key={entry.id} to={`/manga/${manga.id}`} data-media-type="manga" data-resource-id={manga.id}
                    className="grid min-w-[700px] grid-cols-[minmax(0,1.7fr)_120px_80px_110px_110px_120px] items-center gap-3 px-5 py-3 text-[10.5px] text-[#6B6B85] hover:bg-[#FBFAFE]">
                    <span className="flex min-w-0 items-center gap-3">
                      <MangaCover manga={manga} className="h-10 w-[31px] shrink-0 rounded-[6px]" />
                      <span className="min-w-0">
                        <strong className="block truncate text-[#2B2C44]">{manga.title}</strong>
                        <span className="block truncate">漫画 · {mangaSource(manga)} · ID {manga.id}</span>
                      </span>
                    </span>
                    <span>{manga.chapterCount ?? '—'}</span><span>{entry.format}</span>
                    <span>{manga.downloadCount === null ? '状态未知' : `已下载 ${manga.downloadCount} 章`}</span>
                    <span>{mangaDate(manga.updatedAt)}</span><span className="text-right text-[#6C4AD9]">详情</span>
                  </Link>
                )
              }
              const item = entry.item
              return (
              <div
                key={entry.id}
                data-media-type="novel"
                data-resource-id={item.id}
                className="grid min-w-[700px] grid-cols-[minmax(0,1.7fr)_120px_80px_110px_110px_120px] items-center gap-3 px-5 py-3 transition hover:bg-[#FBFAFE]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CoverArt theme={item.cover} index={item.coverIndex} mini className="h-[40px] w-[31px] shrink-0 rounded-[6px]" />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-[#2B2C44]">{item.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[9px] text-[#A2A2B6]">{item.fileName}</p>
                    <p className="truncate text-[10px]">轻小说 · {item.novelId.split(':')[0]} · ID {item.id}</p>
                  </div>
                </div>
                <span className="truncate text-[10.5px] text-[#6B6B85]">{item.volumeLabel}</span>
                <span className="text-[10.5px] text-[#6B6B85]">{entry.format} · {item.size}</span>
                <span>
                  <Badge tone={integrityMeta[item.integrity].tone}>{integrityMeta[item.integrity].label}</Badge>
                </span>
                <span className="text-[10px] text-[#A2A2B6]">{item.addedAt}</span>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => verify(item)}
                    className="rounded-full px-2 py-1 text-[10px] text-[#6C4AD9] transition hover:bg-[#F1EDFE]"
                  >
                    校验
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetail(item)}
                    className="rounded-full px-2 py-1 text-[10px] text-[#6B6B85] transition hover:bg-[#F1EDFE] hover:text-[#6C4AD9]"
                  >
                    详情
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="rounded-full px-2 py-1 text-[10px] text-[#C2377B] transition hover:bg-[#FFF1F5]"
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
                <p className="mt-2 break-all font-mono text-[10px] text-[#8B8BA0]">{detail.fileName}</p>
                <p className="mt-3 text-[10.5px] leading-relaxed text-[#A2A2B6]">
                  {detail.volumeLabel} · {detail.size} · 添加于 {detail.addedAt}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {detail.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[#F5F2FF] px-2 py-0.5 text-[9.5px] text-[#7C6BB8]">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2 rounded-[12px] bg-[#FBFAFE] p-4 text-[10px]">
              {[
                ['文件 ID', detail.id],
                ['大小', detail.size],
                ['完整性', integrityMeta[detail.integrity].label],
                ['来源任务', `task_${detail.id.replace('lib_', '')}`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-[#A2A2B6]">{label}</span>
                  <span className="font-mono text-[#5B5B73]">{value}</span>
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
        <div className="px-6 py-5 text-[11.5px] leading-relaxed text-[#6B6B85]">
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
    <Card className="flex items-center gap-3 p-4">
      <IconTile className="h-9 w-9 bg-[#F6F3FF]">{icon}</IconTile>
      <div className="min-w-0">
        <p className="text-[16px] font-bold leading-none text-[#25263C]">
          {value}
        </p>
        <p className="mt-1.5 truncate text-[9.5px] text-[#A2A2B6]">{label}</p>
      </div>
    </Card>
  )
}

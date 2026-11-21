import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, Download, ExternalLink, RefreshCw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, SectionTitle, Spinner } from '@/components/common/ui'
import { PageHeader } from '@/components/common/PageHeader'
import { Modal } from '@/components/common/Modal'
import { useToast } from '@/components/common/Toast'
import { MangaCover, mangaDate, mangaSource, mangaStatus } from '@/components/manga/MangaCard'
import { MangaNotice } from '@/components/manga/MangaNotice'
import { useAsync } from '@/hooks/useAsync'
import { mangaApi, mangaKomgaApi } from '@/services/mangaApi'
import { IS_LIVE } from '@/services/runtime'
import type { MangaChapter } from '@/types/manga'

export function MangaDetailPage() {
  const { id = '' } = useParams()
  return <MangaDetail key={id} id={id} />
}

const failureTitles = {
  library: '书架更新失败',
  subscribe: '订阅更新失败',
  refresh: '章节更新失败',
  download: '下载提交失败',
}

function MangaDetail({ id }: { id: string }) {
  const { toast } = useToast()
  const [revision, setRevision] = useState(0)
  const detail = useAsync(() => mangaApi.details(id), [id, revision])
  const [offset, setOffset] = useState(0)
  const [chapters, setChapters] = useState<MangaChapter[]>([])
  const [hasNextPage, setHasNextPage] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState(false)
  const chapterPage = useAsync(() => mangaApi.chapters(id, offset), [id, offset, revision])
  const manga = detail.error ? null : detail.data

  useEffect(() => {
    if (!chapterPage.data || chapterPage.error || chapterPage.loading) return
    const page = chapterPage.data
    setChapters((previous) => {
      const next = new Map((offset === 0 ? [] : previous).map((chapter) => [chapter.id, chapter]))
      for (const chapter of page.chapters) next.set(chapter.id, chapter)
      return [...next.values()]
    })
    setHasNextPage(page.hasNextPage)
  }, [chapterPage.data, chapterPage.error, chapterPage.loading, offset])

  const reload = () => {
    setOffset(0)
    setRevision((current) => current + 1)
  }

  const run = async (action: keyof typeof failureTitles, perform: () => Promise<void>) => {
    setBusy(action)
    setActionError('')
    try {
      await perform()
    } catch (error) {
      setActionError(error instanceof Error ? `${failureTitles[action]} · ${error.message}` : failureTitles[action])
    } finally {
      setBusy('')
    }
  }

  const changeMembership = (operation: 'library' | 'subscribe', add: boolean) => run(operation, async () => {
    if (operation === 'library') await mangaApi.setLibrary(id, add)
    else await mangaApi.subscribe(id, add)
    toast({
      tone: 'success',
      title: operation === 'library' ? '已加入漫画书架' : add ? '已订阅漫画追更' : '已取消订阅并移出漫画书架',
    })
    setConfirmUnsubscribe(false)
    setRevision((current) => current + 1)
  })

  const download = () => run('download', async () => {
    const { queued, skipped, completed = [], unconfirmed = [] } = await mangaApi.download(id, selected)
    setSelected([])
    const summary = [
      completed.length ? `${completed.length} 个章节已下载。` : '',
      skipped.length ? `跳过 ${skipped.length} 个已下载或已排队的章节。` : '',
    ].filter(Boolean).join(' ')
    toast(unconfirmed.length ? {
      tone: 'warning',
      title: `${unconfirmed.length} 个章节的下载状态待确认`,
      description: `队列确认 ${queued.length} 个章节。请查看 Suwayomi 下载队列和已下载章节。${summary}`,
    } : {
      tone: queued.length || completed.length ? 'success' : 'info',
      title: queued.length ? `已在下载队列确认 ${queued.length} 个章节` : completed.length ? '已确认章节下载完成' : '没有新增下载任务',
      description: summary || undefined,
    })
    reload()
  })

  const refresh = () => run('refresh', async () => {
    await mangaApi.refresh(id)
    setSelected([])
    reload()
    toast({ tone: 'success', title: '已向漫画源更新章节' })
  })

  const localSource = manga?.sourceId === '0'
  const selectable = localSource ? [] : chapters.filter((chapter) => !chapter.downloaded)
  const maxSelection = 50
  const latestId = chapters[0]?.id

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/search?type=manga" className="inline-flex items-center gap-2 text-xs font-semibold text-[#6C4AD9]">
          <ArrowLeft className="h-4 w-4" /> 搜索漫画
        </Link>
        <Link to="/tasks?type=manga" className="text-xs font-semibold text-[#6C4AD9]">查看漫画下载队列</Link>
      </div>
      {detail.loading && !manga ? <p role="status" className="text-xs text-[#6B6B85]"><Spinner /> 读取漫画资料…</p>
        : !manga ? (
          <Card>
            <EmptyState icon={<BookOpen />} title="漫画详情不可用" description={detail.error ?? undefined}
              action={<Button size="sm" onClick={reload}>重试</Button>} />
          </Card>
        ) : (
          <>
            <Card className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-x-5 sm:p-6">
              <MangaCover manga={manga} className="aspect-[3/4] w-full self-start rounded-[12px] shadow-card sm:row-span-2" eager />
              <div className="min-w-0 self-start">
                <PageHeader
                  eyebrow="Manga"
                  className="gap-2 pb-3 [&_h1]:break-words"
                  title={manga.title}
                  description={`${manga.author || '作者未知'} · ${mangaSource(manga)} · ${manga.source?.lang ?? '语言未知'}`}
                  actions={<Badge tone={IS_LIVE ? 'violet' : 'amber'}>{IS_LIVE ? mangaStatus(manga.status) : '演示数据'}</Badge>}
                />
                <div className="flex flex-wrap gap-1.5">
                  {!IS_LIVE && <Badge>{mangaStatus(manga.status)}</Badge>}
                  {manga.inLibrary && <Badge tone="green">已在漫画书架</Badge>}
                  {manga.subscribed && <Badge tone="green">已订阅</Badge>}
                  <Badge tone="gray">ID {manga.id}</Badge>
                </div>
              </div>
              <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
                {manga.url && /^https?:\/\//i.test(manga.url) && (
                  <a href={manga.url} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-[#6C4AD9]">
                    <ExternalLink className="h-3.5 w-3.5" /> 来源网站
                  </a>
                )}
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[#6B6B85]">{manga.description || '暂无简介。'}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" disabled={Boolean(busy) || detail.loading || manga.inLibrary} loading={busy === 'library'}
                    onClick={() => void changeMembership('library', true)}>加入漫画书架</Button>
                  <Button size="sm" variant="soft" disabled={Boolean(busy) || detail.loading} loading={busy === 'subscribe'}
                    onClick={() => manga.subscribed ? setConfirmUnsubscribe(true) : void changeMembership('subscribe', true)}>
                    {manga.subscribed ? '取消订阅' : '订阅追更'}
                  </Button>
                  <Button size="sm" disabled={Boolean(busy) || chapterPage.loading} loading={busy === 'refresh'} onClick={() => void refresh()}
                    icon={<RefreshCw className="h-3.5 w-3.5" />}>更新章节</Button>
                </div>
                <p className="mt-2 text-xs text-[#8B8BA0]">追更以 Suwayomi 书架成员身份管理，检查频率和更新策略由 Suwayomi 设置决定。</p>
              </div>
            </Card>
            {actionError && <MangaNotice message={actionError} />}
            {IS_LIVE && !localSource && <KomgaDownload id={id} revision={revision} />}
            <Card className="p-4 sm:p-5">
              <SectionTitle title="章节" />
              <div className="my-3 flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={!selectable.length || Boolean(busy)} onClick={() => setSelected(
                  selectable.slice(0, maxSelection).every((chapter) => selected.includes(chapter.id))
                    ? []
                    : selectable.slice(0, maxSelection).map((chapter) => chapter.id),
                )}>选择可下载章节</Button>
                <Button size="sm" variant="primary" loading={busy === 'download'} disabled={!selected.length || Boolean(busy) || chapterPage.loading || Boolean(chapterPage.error)}
                  icon={<Download className="h-3.5 w-3.5" />} onClick={() => void download()}>下载选中章节（{selected.length}）</Button>
                <span className="text-xs text-[#6B6B85]">
                  {localSource ? '本地漫画中的章节已存放在 Suwayomi 数据目录。' : `每次最多 ${maxSelection} 章`}
                </span>
              </div>
              {chapterPage.error && <MangaNotice message={`章节不可用 · ${chapterPage.error}`} />}
              {!chapterPage.loading && !chapterPage.error && !chapters.length && (
                <EmptyState icon={<BookOpen />} title="暂无章节" description="点击更新章节，从漫画源读取最新目录。" />
              )}
              {!chapterPage.error && (
                <ul className="divide-y divide-[#F3F1F9]">
                  {chapters.map((chapter) => (
                    <li key={chapter.id}>
                      <label className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-xs">
                        <input type="checkbox" aria-label={chapter.name} checked={selected.includes(chapter.id)}
                          disabled={localSource || chapter.downloaded || Boolean(busy) || (!selected.includes(chapter.id) && selected.length >= maxSelection)}
                          className="h-4 w-4 accent-[#7E5EE9]"
                          onChange={(event) => setSelected(event.target.checked ? [...selected, chapter.id] : selected.filter((entry) => entry !== chapter.id))} />
                        <span className="min-w-0 flex-1 break-words font-semibold text-[#2B2C44]">{chapter.name}</span>
                        <span className="flex flex-wrap gap-1">
                          {chapter.id === latestId && <Badge>最新</Badge>}
                          {chapter.downloaded && <Badge tone="green">已下载</Badge>}
                          {chapter.read && <Badge tone="gray">已读</Badge>}
                        </span>
                        <time className="text-[#77778F]">{mangaDate(chapter.uploadDate)}</time>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {chapterPage.loading ? <p role="status" className="mt-3 text-xs text-[#6B6B85]"><Spinner /> 读取章节…</p>
                : hasNextPage && !chapterPage.error && (
                  <Button size="sm" className="mt-3" disabled={Boolean(busy)} onClick={() => setOffset(chapters.length)}>加载更多章节</Button>
                )}
            </Card>
          </>
        )}
      <Modal open={confirmUnsubscribe} onClose={() => setConfirmUnsubscribe(false)} title="取消漫画追更？" width="max-w-[440px]"
        footer={<div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => setConfirmUnsubscribe(false)}>保留订阅</Button>
          <Button size="sm" variant="danger" loading={busy === 'subscribe'}
            onClick={() => void changeMembership('subscribe', false)}>取消订阅并移出书架</Button>
        </div>}>
        <p className="p-5 text-sm text-[#6B6B85]">Suwayomi 通过漫画书架决定追更范围。取消订阅会把此漫画移出书架。</p>
        {actionError && <MangaNotice message={actionError} />}
      </Modal>
    </div>
  )
}

function KomgaDownload({ id, revision }: { id: string; revision: number }) {
  const { toast } = useToast()
  const [refreshes, setRefreshes] = useState(0)
  const catalog = useAsync(() => mangaKomgaApi.volumes(id), [id, revision, refreshes])
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const volumes = catalog.data?.volumes ?? []
  const volume = volumes.find((entry) => String(entry.number) === choice) ?? volumes[0]
  const waitingForArchive = volume?.state === 'waiting_archive'
  const downloading = volume?.state === 'downloading' || volume?.state === 'queued'
  const activeChapter = volume?.tasks.find((task) => task.state === 'running')
  const isActive = downloading || waitingForArchive
  useEffect(() => {
    if (!isActive) return
    const timer = window.setInterval(() => setRefreshes((current) => current + 1), 10000)
    return () => window.clearInterval(timer)
  }, [isActive])

  const download = async () => {
    if (!volume) return
    setBusy(true)
    setError('')
    try {
      const result = await mangaKomgaApi.download(id, volume.number)
      const unconfirmed = result.unconfirmed?.length ?? 0
      if (unconfirmed) {
        toast({ tone: 'warning', title: `${unconfirmed} 话的下载状态待确认`,
          description: `已确认排队 ${result.queued.length} 话，请查看漫画下载队列。` })
      } else if (result.filename) {
        toast({ tone: 'success', title: `已写入 Komga 目录 · ${result.filename}` })
      } else {
        toast({
          tone: 'info',
          title: result.queued.length ? `已确认排队 ${result.queued.length} 话` : '没有新增下载任务',
          description: '该卷下载齐后会自动写入 Komga 目录，可刷新查看归档结果。',
        })
      }
      setRefreshes((current) => current + 1)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '提交 Komga 下载失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle title="下载到 Komga" />
      {catalog.loading && !catalog.data ? <p role="status" className="mt-2 text-xs text-[#6B6B85]"><Spinner /> 读取分卷…</p>
        : catalog.error ? <MangaNotice message={catalog.error} />
        : !catalog.data?.available ? <p className="mt-2 text-xs text-[#6B6B85]">此 Studio 尚未连接 Komga 归档服务。</p>
        : !volume ? <p className="mt-2 text-xs text-[#6B6B85]">该来源没有可识别的分卷，可在下方下载单话。</p>
        : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select aria-label="选择要下载到 Komga 的卷" value={String(volume.number)} disabled={busy || catalog.loading}
                onChange={(event) => { setChoice(event.target.value); setError('') }}
                className="max-w-full rounded-lg border border-[#E7E0FA] bg-white px-3 py-2 text-xs text-[#2B2C44]">
                {volumes.map((entry) => <option key={entry.number} value={entry.number}>第 {entry.number} 卷</option>)}
              </select>
              <Button size="sm" variant="primary" loading={busy}
                disabled={busy || catalog.loading || Boolean(volume.filename) || isActive || volume.total > 100}
                icon={<Download className="h-3.5 w-3.5" />} onClick={() => void download()}>一键下载到 Komga</Button>
            </div>
            <p role="status" className="mt-2 text-xs text-[#6B6B85]">
              {volume.filename ? `已写入 Komga 目录 · ${volume.filename}`
                : waitingForArchive ? '本卷已下载，正在等待生成 CBZ。'
                : volume.state === 'failed' ? 'Suwayomi 报告下载失败，请查看漫画下载队列。'
                : downloading ? `已下载 ${volume.downloaded} / ${volume.total} 条 · ${activeChapter
                  ? `${activeChapter.chapterName}下载中${activeChapter.percent === null ? '' : ` ${activeChapter.percent}%`}`
                  : 'Suwayomi 已排队'}`
                : volume.total > 100 ? '该卷超过 100 话，请分批下载章节，下载齐后会自动归档。'
                : `已下载 ${volume.downloaded} / ${volume.total} 条，下载齐后自动生成一个 CBZ。`}
            </p>
          </>
        )}
      {(catalog.error || catalog.data?.available) && <Button size="sm" className="mt-2" disabled={busy || catalog.loading}
        icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setRefreshes((current) => current + 1)}>刷新归档状态</Button>}
      {error && <MangaNotice message={error} />}
    </Card>
  )
}

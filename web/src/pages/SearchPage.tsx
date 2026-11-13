import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookMarked, Info, Link2, Search, SlidersHorizontal, X } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/common/ui'
import { PageHeader } from '@/components/common/PageHeader'
import { NovelCard } from '@/components/novel/NovelCard'
import { NovelDetailDialog } from '@/components/novel/NovelDetailDialog'
import { useToast } from '@/components/common/Toast'
import { novelApi, type SearchResult } from '@/services/novelApi'
import type { Novel, NovelStatus, SourceId } from '@/types'
import { cn } from '@/services/utils'

const sourceFilters: { id: SourceId | 'all'; label: string }[] = [
  { id: 'all', label: '全部书源' },
  { id: 'bilinovel', label: 'Bilinovel' },
  { id: 'fixture', label: '示例源' },
  { id: 'local', label: '本地索引' },
]

const statusFilters: { id: 'all' | NovelStatus; label: string }[] = [
  { id: 'all', label: '全部状态' },
  { id: 'ongoing', label: '连载中' },
  { id: 'completed', label: '已完结' },
]

const hotKeywords = ['月下的茶馆', '无职转生', '86', '史莱姆', '治愈', '异世界']

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const initial = params.get('q') ?? ''
  const [input, setInput] = useState(initial)
  const [keyword, setKeyword] = useState(initial)
  const [source, setSource] = useState<'all' | SourceId>('all')
  const [status, setStatus] = useState<'all' | NovelStatus>('all')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeNovel, setActiveNovel] = useState<Novel | null>(null)
  const requestId = useRef(0)
  const { toast } = useToast()

  useEffect(() => {
    const query = params.get('q') ?? ''
    setKeyword(query)
    setInput(query)
  }, [params])

  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    novelApi
      .searchNovels({
        keyword,
        status,
        sources: source === 'all' ? [] : [source],
      })
      .then((data) => {
        if (requestId.current !== id) return
        setResult(data)
        setLoading(false)
      })
    return () => {
      requestId.current += 1
    }
  }, [keyword, source, status])

  const results = result?.results ?? []
  const selectedSourceLabel = useMemo(
    () => sourceFilters.find((item) => item.id === source)?.label ?? '全部书源',
    [source],
  )

  const submit = (value?: string) => {
    const query = (value ?? input).trim()
    setInput(query)
    setKeyword(query)
    if (query) setParams({ q: query })
    else setParams({})
  }

  const reset = () => {
    setInput('')
    setKeyword('')
    setSource('all')
    setStatus('all')
    setParams({})
  }

  return (
    <div>
      <PageHeader
        eyebrow="Find your next story"
        title={
          <span>
            搜索发现 <span className="text-[14px] font-medium text-[#B5B5C6]">/ 多书源检索</span>
          </span>
        }
        description="按书名、作者或关键词检索已配置书源。演示环境只过滤本地样例数据，不会发起真实抓取。"
        actions={
          <>
            <Badge tone="amber" className="h-7 px-3">
              演示数据
            </Badge>
            <Button variant="secondary" size="sm" icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => toast({ tone: 'info', title: 'URL 直达暂为占位', description: '后端 /api/novels/:id 尚未实现，接入后可直接解析书籍链接。' })}>
              URL 直达
            </Button>
          </>
        }
      />

      <Card className="relative overflow-hidden rounded-[22px] border-[#E9E4FA] bg-[linear-gradient(100deg,#F6F3FF,#EFEAFF_60%,#E4DDFC)] px-5 py-5 sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute right-0 top-0 h-full w-[280px] grid-dots opacity-30 [mask-image:linear-gradient(to_left,black,transparent)]" />
        <div className="relative">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex h-[52px] flex-1 items-center gap-3 rounded-full bg-white px-5 shadow-[0_14px_34px_-24px_rgba(72,52,150,0.55)] ring-1 ring-[#E7E1FA]">
              <Search className="h-[17px] w-[17px] shrink-0 text-[#A6A6B8]" strokeWidth={1.8} />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && submit()}
                placeholder="输入书名、作者或关键词…"
                aria-label="搜索小说"
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-[#33344B] placeholder:text-[#ADADC0] focus:outline-none"
              />
              {input && (
                <button type="button" aria-label="清空" onClick={() => setInput('')} className="text-[#B5B5C6] hover:text-[#6C4AD9]">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => submit()}
              className="h-[48px] shrink-0 rounded-full bg-[linear-gradient(95deg,#8B6BF0,#7E5EE9_55%,#6C4AD9)] px-8 text-[12.5px] font-semibold text-white shadow-[0_12px_26px_-14px_rgba(108,74,217,0.95)] transition hover:brightness-105 active:scale-[0.99]"
            >
              搜索书籍
            </button>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#A79FC4]">热门</span>
            {hotKeywords.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => submit(tag)}
                className="rounded-full border border-white/70 bg-white/55 px-2.5 py-1 text-[10.5px] text-[#7E7E97] backdrop-blur-sm transition hover:border-[#D8CFF7] hover:bg-white hover:text-[#6C4AD9]"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-1.5 text-[10.5px] text-[#A2A2B6]">
            <SlidersHorizontal className="h-3 w-3" />
            书源
          </span>
          {sourceFilters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSource(item.id)}
              className={cn(
                'h-8 rounded-full border px-3.5 text-[11px] transition',
                source === item.id
                  ? 'border-[#C4B5FB] bg-[#F1EDFE] font-semibold text-[#6C4AD9]'
                  : 'border-[#EDEAF6] bg-white text-[#7A7A92] hover:border-[#DCD4F7] hover:text-[#6C4AD9]',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] text-[#A2A2B6]">状态</span>
          <div className="inline-flex rounded-full border border-[#EDEAF6] bg-white p-1">
            {statusFilters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStatus(item.id)}
                className={cn(
                  'h-7 rounded-full px-3 text-[11px] transition',
                  status === item.id ? 'bg-[#F1EDFE] font-semibold text-[#6C4AD9]' : 'text-[#8B8BA0] hover:text-[#6C4AD9]',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {(keyword || source !== 'all' || status !== 'all') && (
            <button
              type="button"
              onClick={reset}
              className="h-7 rounded-full px-2.5 text-[10.5px] text-[#A2A2B6] transition hover:bg-[#F5F2FF] hover:text-[#6C4AD9]"
            >
              重置筛选
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#F0EEF7] pt-4">
        <div className="flex items-center gap-2 text-[11px] text-[#8B8BA0]">
          {loading ? (
            <>
              <Spinner className="h-3 w-3" />
              正在检索 {selectedSourceLabel}…
            </>
          ) : (
            <>
              找到 <span className="font-semibold text-[#6C4AD9]">{result?.total ?? 0}</span> 本相关作品
              {keyword && <span className="text-[#B5B5C6]">· 关键词「{keyword}」</span>}
              <span className="text-[#B5B5C6]">· {selectedSourceLabel}</span>
            </>
          )}
        </div>
        <span className="hidden items-center gap-1 text-[10px] text-[#B5B5C6] sm:flex">
          <Info className="h-3 w-3" />
          结果按相关度排序 · Mock 数据
        </span>
      </div>

      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="rounded-[14px] border border-[#F1EFF8] bg-white p-1.5">
              <div className="skeleton aspect-[3/4] w-full rounded-[10px]" />
              <div className="space-y-2 px-1.5 py-3">
                <div className="skeleton h-3 w-3/4 rounded-full" />
                <div className="skeleton h-2 w-1/2 rounded-full" />
                <div className="skeleton h-2 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {results.map((novel) => (
            <NovelCard key={novel.id} novel={novel} onOpen={setActiveNovel} />
          ))}
        </div>
      ) : (
        <Card className="mt-4">
          <EmptyState
            icon={<BookMarked className="h-6 w-6" />}
            title="没有找到匹配的作品"
            description="试试更短的关键词，或切换书源与状态筛选。演示库仅包含 8 本样例小说。"
            action={
              <Button variant="soft" size="sm" onClick={reset}>
                清空筛选条件
              </Button>
            }
          />
        </Card>
      )}

      {result?.degradedSources?.length ? (
        <div className="mt-4 flex items-start gap-2 rounded-[12px] border border-[#F5E3BE] bg-[#FDF8EC] px-4 py-3 text-[10.5px] leading-relaxed text-[#B4791B]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{result.degradedSources.join('；')}。降级书源的结果可能不完整。</span>
        </div>
      ) : null}

      <NovelDetailDialog
        novel={activeNovel}
        onClose={() => setActiveNovel(null)}
        onDownloaded={(title) =>
          toast({ tone: 'success', title: `已加入下载队列：${title}`, description: '前往「下载任务」查看实时进度。' })
        }
      />
    </div>
  )
}

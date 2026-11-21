import { useSearchParams } from 'react-router-dom'
import { cn } from '@/services/utils'

export type MediaFilter = 'all' | 'novel' | 'manga'

const options = [
  ['all', '全部'],
  ['novel', '轻小说'],
  ['manga', '漫画'],
] as const

export function useMediaFilter(): MediaFilter {
  const [params] = useSearchParams()
  const type = params.get('type')
  return type === 'novel' || type === 'manga' ? type : 'all'
}

export function MediaFilterTabs() {
  const selected = useMediaFilter()
  const [params, setParams] = useSearchParams()

  return (
    <div role="group" aria-label="资源类型" className="mb-4 inline-flex rounded-full border border-line bg-surface p-1">
      {options.map(([type, label]) => (
        <button
          key={type}
          type="button"
          aria-pressed={selected === type}
          className={cn(
            'h-8 rounded-full px-4 text-xs transition',
            selected === type ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-soft hover:text-accent',
          )}
          onClick={() => {
            const next = new URLSearchParams(params)
            if (type === 'all') next.delete('type')
            else next.set('type', type)
            setParams(next)
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

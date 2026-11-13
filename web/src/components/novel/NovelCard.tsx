import { cn } from '@/services/utils'
import type { Novel } from '@/types'
import { CoverArt } from './CoverArt'

export function NovelCard({
  novel,
  className,
  onOpen,
  compact,
}: {
  novel: Novel
  className?: string
  onOpen?: (novel: Novel) => void
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'group cursor-pointer rounded-[14px] border border-[#F1EFF8] bg-white p-[6px] transition-all duration-300',
        'hover:-translate-y-1 hover:border-[#E3DCF8] hover:shadow-[0_18px_34px_-20px_rgba(78,54,168,0.35)]',
        className,
      )}
      onClick={() => onOpen?.(novel)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen?.(novel)
      }}
      role="button"
      tabIndex={0}
      aria-label={`查看《${novel.title}》`}
    >
      <CoverArt
        theme={novel.cover}
        index={novel.coverIndex}
        title={novel.title}
        caption={captionFor(novel)}
        showTag={novel.id === 'fixture:moon-teahouse'}
        className={cn('aspect-[3/4] w-full rounded-[10px] transition-transform duration-500 group-hover:scale-[1.012]', compact && 'rounded-[8px]')}
      />
      <div className={cn('px-1.5 pb-1 pt-3', compact && 'pt-2.5')}>
        <p className="truncate text-[13.5px] font-bold tracking-[-0.005em] text-[#25263C] transition-colors group-hover:text-[#5A3FC0]">
          {novel.title}
        </p>
        <p className="mt-1 truncate text-[11px] text-[#A2A2B6]">{novel.author}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[10.5px]">
          <span className="truncate text-[#8F8FA4]">
            {novel.volumes} 卷
            <span className="hidden 2xl:inline"> · {novel.source}</span>
          </span>
          <span className={cn('flex shrink-0 items-center gap-1', novel.status === 'completed' ? 'text-[#7C5CE8]' : 'text-[#0B9E74]')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', novel.status === 'completed' ? 'bg-[#8B63F2]' : 'bg-[#10B981]')} />
            {novel.status === 'completed' ? '已完结' : '连载中'}
          </span>
        </div>
      </div>
    </div>
  )
}

function captionFor(novel: Novel) {
  switch (novel.cover) {
    case 'moon':
      return 'Stories Under The Moon'
    case 'flower':
      return 'Too Many Losing Heroines'
    case 'mountain':
      return 'Another World'
    case 'orb':
      return 'New Beginning'
    case 'city':
      return 'Eighty Six'
    case 'rose':
      return 'Letters From The Sea'
    case 'night':
      return 'Stardust Observatory'
    case 'paper':
      return 'Notes Of Spring'
  }
}

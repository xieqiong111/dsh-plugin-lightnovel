import { Check, Minus } from 'lucide-react'
import { cn } from '@/services/utils'
import type { Volume } from '@/types'

export function VolumeSelector({
  volumes,
  selected,
  onChange,
  className,
}: {
  volumes: Volume[]
  selected: string[]
  onChange: (next: string[]) => void
  className?: string
}) {
  const allSelected = volumes.length > 0 && selected.length === volumes.length
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])
  }

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : volumes.map((volume) => volume.id))}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#6C4AD9] transition hover:text-[#5738B8]"
        >
          <span
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-[5px] border transition',
              allSelected ? 'border-[#7E5EE9] bg-[#7E5EE9] text-white' : 'border-[#DCD7EC] bg-white text-transparent',
            )}
          >
            {allSelected ? <Check className="h-2.5 w-2.5" /> : selected.length > 0 ? <Minus className="h-2.5 w-2.5 text-[#7E5EE9]" /> : null}
          </span>
          全选分卷
        </button>
        <span className="text-[10.5px] text-[#A2A2B6]">
          已选 <span className="font-semibold text-[#6C4AD9]">{selected.length}</span> / {volumes.length} 卷
        </span>
      </div>

      <div className="grid max-h-[286px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {volumes.map((volume) => {
          const active = selected.includes(volume.id)
          return (
            <button
              key={volume.id}
              type="button"
              onClick={() => toggle(volume.id)}
              aria-pressed={active}
              className={cn(
                'rounded-[10px] border px-3 py-2 text-left transition-all duration-200',
                active
                  ? 'border-[#C4B5FB] bg-[#F5F2FF] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.25)]'
                  : 'border-[#EFEDF6] bg-white hover:border-[#DCD4F7] hover:bg-[#FBFAFE]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn('truncate text-[11.5px] font-semibold', active ? 'text-[#5738B8]' : 'text-[#3F4058]')}>
                  {volume.name}
                </span>
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                    active ? 'border-[#7E5EE9] bg-[#7E5EE9]' : 'border-[#E1DDEF] bg-white',
                  )}
                >
                  {active && <Check className="h-2 w-2 text-white" />}
                </span>
              </div>
              <p className="mt-1 text-[9.5px] text-[#A2A2B6]">{volume.chapters} 章 · {volume.updatedAt}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

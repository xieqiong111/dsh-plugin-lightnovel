import React from 'react'
import { cn } from '@/services/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-[#A78BFA]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#1E1F35] lg:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-[640px] text-[11.5px] leading-relaxed text-[#8B8BA0]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

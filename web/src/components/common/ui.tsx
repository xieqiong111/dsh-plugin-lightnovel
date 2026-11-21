import React from 'react'
import { cn } from '@/services/utils'

/* 轻量 shadcn 风格基础组件（无 Radix 依赖，保持构建轻量） */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  loading?: boolean
}

const buttonVariants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-gradient-to-r from-[#8B6BF0] via-[#7E5EE9] to-[#6E4DE0] text-white shadow-[0_10px_24px_-10px_rgba(114,79,232,0.75)] hover:brightness-[1.05] hover:shadow-[0_14px_28px_-10px_rgba(114,79,232,0.8)] active:brightness-95',
  secondary:
    'border border-line bg-surface text-ink-soft hover:border-accent-line hover:bg-accent-soft hover:text-accent',
  ghost: 'text-ink-soft hover:bg-accent-soft hover:text-accent',
  soft: 'bg-accent-soft text-accent hover:bg-accent-soft',
  danger: 'bg-negative-soft text-negative hover:bg-negative-soft',
  success: 'bg-positive-soft text-positive hover:bg-positive-soft',
}

const buttonSizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-[12px] gap-1.5 rounded-full',
  md: 'h-10 px-5 text-[13px] gap-2 rounded-full',
  lg: 'h-11 px-7 text-[13.5px] gap-2 rounded-full',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', icon, loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/55 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-55',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
})

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current align-middle opacity-80',
        className,
      )}
    />
  )
}

export function Card({
  className,
  children,
  hoverable,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hoverable?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[20px] border border-line bg-surface shadow-card',
        hoverable && 'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function Badge({
  className,
  tone = 'violet',
  children,
}: {
  className?: string
  tone?: 'violet' | 'green' | 'amber' | 'rose' | 'gray'
  children: React.ReactNode
}) {
  const tones = {
    violet: 'bg-accent-soft text-accent',
    green: 'bg-positive-soft text-positive',
    amber: 'bg-caution-soft text-caution',
    rose: 'bg-negative-soft text-negative',
    gray: 'bg-surface-soft text-ink-soft',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-medium leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Progress({
  value,
  className,
  tone = 'violet',
}: {
  value: number
  className?: string
  tone?: 'violet' | 'green' | 'rose' | 'gray'
}) {
  const fill = {
    violet: 'from-[#8B6BF0] to-[#6C4AD9]',
    green: 'from-[#34D399] to-[#059669]',
    rose: 'from-[#F472B6] to-[#DB2777]',
    gray: 'from-[#C9C9DA] to-[#A5A5BB]',
  }
  return (
    <div className={cn('h-[5px] w-full overflow-hidden rounded-full bg-accent-soft', className)}>
      <div
        className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out', fill[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function SectionTitle({
  title,
  accent = true,
  right,
  className,
}: {
  title: React.ReactNode
  accent?: boolean
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="flex items-center gap-2.5">
        {accent && <span className="h-[18px] w-[3px] rounded-full bg-gradient-to-b from-[#A78BFA] to-[#6C4AD9]" />}
        <h2 className="text-[20px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
      </div>
      {right}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        {icon}
      </div>
      <div>
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        {description && <p className="mt-1 max-w-[320px] text-[12px] leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function IconTile({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-accent',
        className,
      )}
    >
      {children}
    </span>
  )
}

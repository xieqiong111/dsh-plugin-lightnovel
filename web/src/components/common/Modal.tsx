import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/services/utils'

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  width = 'max-w-[680px]',
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  eyebrow?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#171632]/45 p-0 backdrop-blur-[3px] animate-fade-in sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : '对话框'}
        className={cn(
          'relative max-h-[92vh] w-full overflow-hidden rounded-t-[24px] bg-white shadow-[0_40px_120px_-40px_rgba(30,31,53,0.55)] animate-fade-up sm:rounded-[24px]',
          width,
        )}
      >
        {(title || eyebrow) && (
          <div className="flex items-start justify-between gap-4 border-b border-[#F2F0F8] px-6 pb-4 pt-5">
            <div>
              {eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A78BFA]">{eyebrow}</p>}
              {title && <h3 className="text-[18px] font-bold tracking-[-0.01em] text-[#1E1F35]">{title}</h3>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[#9A9AAE] transition hover:bg-[#F4F1FD] hover:text-[#6C4AD9]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="max-h-[calc(92vh-140px)] overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-[#F2F0F8] bg-[#FBFAFE] px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

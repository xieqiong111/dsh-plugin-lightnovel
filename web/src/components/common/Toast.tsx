import React, { createContext, useContext, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/services/utils'

type ToastTone = 'success' | 'info' | 'error' | 'warning'

interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface ToastContextValue {
  toast: (input: Omit<ToastItem, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toneMap: Record<ToastTone, { icon: React.ReactNode; ring: string; bar: string }> = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4 text-[#0B9E74]" />,
    ring: 'border-[#D8F3E8]',
    bar: 'bg-[#10B981]',
  },
  info: {
    icon: <Info className="h-4 w-4 text-[#6C4AD9]" />,
    ring: 'border-[#E3DBFB]',
    bar: 'bg-[#7E5EE9]',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4 text-[#B4791B]" />,
    ring: 'border-[#F7E8C8]',
    bar: 'bg-[#F59E0B]',
  },
  error: {
    icon: <AlertTriangle className="h-4 w-4 text-[#C2377B]" />,
    ring: 'border-[#F8DCEB]',
    bar: 'bg-[#F472B6]',
  },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: (input) => {
        const id = Date.now() + Math.random()
        setItems((prev) => [...prev.slice(-3), { ...input, id }])
        window.setTimeout(() => {
          setItems((prev) => prev.filter((item) => item.id !== id))
        }, 4200)
      },
    }),
    [],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-[88px] z-[90] flex w-[calc(100vw-32px)] max-w-[352px] flex-col gap-2.5 sm:right-6">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-[16px] border bg-white/95 px-4 py-3 shadow-[0_18px_40px_-18px_rgba(30,31,53,0.32)] backdrop-blur animate-toast-in',
              toneMap[item.tone].ring,
            )}
          >
            <span className={cn('absolute inset-y-0 left-0 w-[3px]', toneMap[item.tone].bar)} />
            <span className="mt-0.5">{toneMap[item.tone].icon}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-[#2B2C44]">{item.title}</p>
              {item.description && (
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[#8B8BA0]">{item.description}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="关闭通知"
              onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))}
              className="mt-0.5 text-[#B5B5C6] transition hover:text-[#6C4AD9]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast 必须在 ToastProvider 内使用')
  return context
}

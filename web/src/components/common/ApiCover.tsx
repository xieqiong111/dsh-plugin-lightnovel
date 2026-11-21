import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { ApiError, apiFetchBlob } from '@/services/runtime'
import { cn } from '@/services/utils'

export function ApiCover({ path, title, className, eager = false }: {
  path: string | null
  title: string
  className?: string
  eager?: boolean
}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [image, setImage] = useState<{ path: string; url: string }>()
  const ready = eager || visible

  useEffect(() => {
    if (!element || ready || !path) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true)
    }, { rootMargin: '160px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, path, ready])

  useEffect(() => {
    if (!path || !ready) return
    const controller = new AbortController()
    let url: string | undefined
    let retryTimer: number | undefined
    setImage(undefined)
    async function load(coverPath: string, retry: boolean) {
      try {
        const blob = await apiFetchBlob(coverPath, controller.signal)
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob)
        setImage({ path: coverPath, url })
      } catch (error) {
        if (retry && !controller.signal.aborted && error instanceof ApiError && error.status === 429) {
          const delay = Math.min(60_000, error.retryAfterMs || 60_000)
          retryTimer = window.setTimeout(() => void load(coverPath, false), delay + Math.random() * 1000)
        }
      }
    }
    void load(path, true)
    return () => {
      controller.abort()
      window.clearTimeout(retryTimer)
      if (url) URL.revokeObjectURL(url)
    }
  }, [path, ready])

  return (
    <div ref={setElement} className={cn('relative grid place-items-center overflow-hidden bg-accent-soft text-accent', className)}>
      {image && image.path === path ? (
        <img src={image.url} alt={`${title} 封面`} className="absolute inset-0 h-full w-full object-cover" onError={() => setImage(undefined)} />
      ) : (
        <BookOpen className="h-[20%] w-[20%]" aria-label="暂无封面" />
      )}
    </div>
  )
}

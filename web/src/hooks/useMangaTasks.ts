import { useEffect, useState } from 'react'
import { mangaApi } from '@/services/mangaApi'
import { ApiError } from '@/services/runtime'
import type { MangaTask } from '@/types/manga'

export function useMangaTasks(enabled: boolean) {
  const [queue, setQueue] = useState<MangaTask[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer: number | undefined

    const poll = async () => {
      let delay = 5000
      try {
        const result = await mangaApi.tasks()
        if (!alive) return
        setQueue(result.queue)
        setError(null)
      } catch (failure) {
        if (!alive) return
        setQueue([])
        if (failure instanceof ApiError && failure.status === 429) delay = Math.max(delay, failure.retryAfterMs)
        setError(failure instanceof Error ? failure.message : '读取下载队列失败')
      } finally {
        if (alive) {
          setLoading(false)
          timer = window.setTimeout(() => void poll(), delay)
        }
      }
    }

    setLoading(true)
    void poll()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [enabled, attempt])

  return {
    queue: enabled ? queue : [],
    error: enabled ? error : null,
    loading: enabled && loading,
    refresh: () => setAttempt((current) => current + 1),
  }
}

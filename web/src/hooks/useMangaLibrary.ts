import { useEffect, useState } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { mangaApi } from '@/services/mangaApi'
import type { Manga } from '@/types/manga'

export function useMangaLibrary(enabled = true) {
  const [offset, setOffset] = useState(0)
  const [mangas, setMangas] = useState<Manga[]>([])
  const [attempt, setAttempt] = useState(0)
  const { data, loading, error } = useAsync(() => enabled ? mangaApi.library(offset) : Promise.resolve(null), [enabled, offset, attempt])

  useEffect(() => {
    if (!data || loading || error) return
    setMangas((previous) => {
      const next = new Map((offset === 0 ? [] : previous).map((manga) => [manga.id, manga]))
      for (const manga of data.mangas) next.set(manga.id, manga)
      return [...next.values()]
    })
  }, [data, error, loading, offset])

  return {
    mangas: enabled && !error ? mangas : [],
    loading: enabled && loading,
    error: enabled ? error : null,
    hasMore: enabled && !error && Boolean(data?.hasNextPage),
    loadMore: () => setOffset(offset + (data?.mangas.length ?? 0)),
    retry: () => setAttempt((value) => value + 1),
  }
}

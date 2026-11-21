import type { SuwayomiClient, SuwayomiTask } from './suwayomi-client.mjs'

export interface MangaKomga {
  status(mangaId: string, volume?: number): Promise<{
    available: boolean
    volumes: Array<{
      number: number
      total: number
      downloaded: number
      filename: string | null
      state: 'idle' | 'archived' | 'waiting_archive' | 'failed' | 'downloading' | 'queued'
      tasks: SuwayomiTask[]
    }>
  }>
  download(mangaId: string, volume: number): Promise<
    Omit<Awaited<ReturnType<SuwayomiClient['download']>>, 'queue'> & { queue?: SuwayomiTask[]; filename: string | null }
  >
}

export declare function createMangaKomga(client: SuwayomiClient, getVolumes?: undefined, archiveUrl?: string): MangaKomga

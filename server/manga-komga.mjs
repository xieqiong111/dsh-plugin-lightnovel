import { createMangaVolumeClient } from './manga-volume-client.mjs'
import { SuwayomiError } from './suwayomi-client.mjs'

export function createMangaKomga(client, getVolumes, archiveUrl) {
  if (getVolumes === undefined) getVolumes = createMangaVolumeClient(archiveUrl)
  function requireCatalog(mangaId, number) {
    if (!/^[1-9]\d{0,9}$/.test(mangaId) || Number(mangaId) > 2147483647) {
      throw new SuwayomiError('INVALID_ID', '请提供有效的 Suwayomi 漫画 ID。', 400)
    }
    if (number !== undefined && (!Number.isInteger(number) || number < 1 || number > 9999)) {
      throw new SuwayomiError('INVALID_VOLUME', '请选择有效卷号。', 400)
    }
  }

  return {
    async status(mangaId, number) {
      requireCatalog(mangaId, number)
      if (!getVolumes) return { available: false, volumes: [] }
      const catalog = await getVolumes(mangaId)
      const volumes = number === undefined ? catalog : catalog.filter((volume) => volume.number === number)
      const surveyQueue = volumes.some((volume) => !volume.filename && volume.downloaded < volume.chapterIds.length)
      const queue = surveyQueue ? (await client.tasks({ action: 'status' })).queue : []
      const tasks = new Map(queue.filter((task) => task.mangaId === mangaId).map((task) => [task.chapterId, task]))
      return {
        available: true,
        volumes: volumes.map(({ chapterIds, ...volume }) => {
          const active = chapterIds.map((id) => tasks.get(id)).filter(Boolean)
          const total = chapterIds.length
          let state = 'idle'
          if (volume.filename) state = 'archived'
          else if (volume.downloaded === total) state = 'waiting_archive'
          else if (active.some((task) => task.state === 'failed')) state = 'failed'
          else if (active.some((task) => task.state === 'running')) state = 'downloading'
          else if (active.some((task) => task.state === 'queued')) state = 'queued'
          return { ...volume, total, state, tasks: active }
        }),
      }
    },

    async download(mangaId, number) {
      requireCatalog(mangaId, number)
      if (!getVolumes) throw new SuwayomiError('VOLUME_ARCHIVE_DISABLED', '尚未配置 Komga 归档服务。', 503)
      const volume = (await getVolumes(mangaId)).find((entry) => entry.number === number)
      if (!volume) throw new SuwayomiError('VOLUME_UNAVAILABLE', '这一卷缺少明确的来源条目，或源目录已经变化。', 409)
      if (volume.filename || volume.downloaded === volume.chapterIds.length) {
        return { queued: [], skipped: volume.chapterIds, completed: [], unconfirmed: [], filename: volume.filename }
      }
      if (volume.chapterIds.length > 100) {
        throw new SuwayomiError('VOLUME_TOO_LARGE', '该卷超过 100 话，请分批下载章节，下载齐后会自动归档。', 409)
      }
      return { ...(await client.download({ mangaId, chapterIds: volume.chapterIds })), filename: null }
    },
  }
}

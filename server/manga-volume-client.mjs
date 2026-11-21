import { SuwayomiError } from './suwayomi-client.mjs'

export function createMangaVolumeClient(value = process.env.LN_VOLUME_ARCHIVE_URL) {
  if (!value) return null
  let origin
  try {
    const url = new URL(value)
    if (['http:', 'https:'].includes(url.protocol) && url.href === `${url.origin}/`) origin = url.origin
  } catch {
    // Keep the other manga and novel routes available on invalid configuration.
  }
  return async function getVolumes(mangaId) {
    try {
      if (!origin || !/^[1-9]\d{0,9}$/.test(mangaId)) throw new Error('Invalid endpoint')
      const response = await fetch(`${origin}/manga/${mangaId}/volumes`, {
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error('Archive lookup failed')
      }
      const { volumes } = await response.json()
      if (!Array.isArray(volumes) || volumes.length > 5000 || !volumes.every(validVolume)) {
        throw new Error('Invalid volume catalog')
      }
      return volumes
    } catch {
      throw new SuwayomiError('VOLUME_ARCHIVE_UNAVAILABLE', 'Komga 归档服务暂不可用。', 503)
    }
  }
}

function validVolume(volume) {
  return volume && Number.isInteger(volume.number) && volume.number > 0 && volume.number <= 9999
    && Array.isArray(volume.chapterIds) && volume.chapterIds.length > 0 && volume.chapterIds.length <= 5000
    && volume.chapterIds.every((id) => typeof id === 'string' && /^[1-9]\d{0,9}$/.test(id))
    && Number.isInteger(volume.downloaded) && volume.downloaded >= 0 && volume.downloaded <= volume.chapterIds.length
    && (volume.filename === null || volume.filename === `第${String(volume.number).padStart(2, '0')}卷.cbz`)
}

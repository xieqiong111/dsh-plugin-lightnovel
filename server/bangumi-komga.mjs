import { randomBytes } from 'node:crypto'
import { normalizeKomgaUrl } from './komga-client.mjs'

export class MetadataError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : ''
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const komgaId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value)
const subjectId = (value) => Number.isSafeInteger(value) && value > 0 && value <= 9999999999
const MAX_PREVIEWS = 32
const PREVIEW_MS = 10 * 60 * 1000

function selection(body) {
  if (!['novel', 'manga'].includes(body.kind) || !['series', 'book'].includes(body.scope)) {
    throw new MetadataError(400, 'INVALID_METADATA_TYPE', '请选择小说或漫画，以及系列或单册。')
  }
  return { kind: body.kind, scope: body.scope }
}

async function readAdapterJson(response) {
  const chunks = []
  let length = 0
  for await (const chunk of response.body ?? []) {
    length += chunk.byteLength
    if (length > 1024 * 1024) throw new MetadataError(502, 'METADATA_RESPONSE_TOO_LARGE', '元数据响应超过大小限制。')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function candidate(value) {
  if (!object(value) || !subjectId(value.id) || !text(value.name, 300)) {
    throw new MetadataError(502, 'INVALID_METADATA_RESPONSE', 'BangumiKomga 返回了无效条目。')
  }
  return {
    id: value.id, name: text(value.name, 300), nameCn: text(value.nameCn, 300),
    summary: text(value.summary, 500), date: text(value.date, 20), url: `https://bgm.tv/subject/${value.id}`,
    ...(Number.isInteger(value.score) ? { score: value.score } : {}),
  }
}

function appendUnique(current, items, key) {
  const existing = Array.isArray(current) ? current : []
  const seen = new Set(existing.map(key))
  const additions = []
  for (const item of items) {
    const identity = key(item)
    if (seen.has(identity)) continue
    seen.add(identity)
    additions.push(item)
  }
  return additions.length ? [...existing, ...additions] : undefined
}

function rowList(value, pair, validate = () => true) {
  if (!Array.isArray(value)) return []
  const [first, second] = pair
  return value.slice(0, 32).flatMap((row) => {
    if (!object(row)) return []
    const label = text(row[first], 300)
    const content = text(row[second], 300)
    return label && content && validate(content) ? [{ [first]: label, [second]: content }] : []
  })
}

function changes(current, input, scope, subject) {
  const patch = {}
  function field(name, value) {
    if (value !== undefined && current[name + 'Lock'] !== true && JSON.stringify(current[name]) !== JSON.stringify(value)) {
      patch[name] = value
    }
  }
  const scalarFields = scope === 'series'
    ? [['title', 300], ['summary', 20000], ['publisher', 300]]
    : [['summary', 20000], ['releaseDate', 10]]
  for (const [name, maximum] of scalarFields) {
    const value = text(input[name], maximum)
    if (value && (name !== 'releaseDate' || /^\d{4}-\d{2}-\d{2}$/.test(value))) field(name, value)
  }
  if (scope === 'series') {
    field('alternateTitles', appendUnique(current.alternateTitles,
      rowList(input.alternateTitles, ['label', 'title']), (row) => row?.title))
    if (input.ageRating === 18 && Number(current.ageRating ?? 0) < 18) field('ageRating', 18)
  } else {
    field('authors', appendUnique(current.authors,
      rowList(input.authors, ['name', 'role']), (row) => JSON.stringify([row?.name, row?.role])))
  }
  if (Array.isArray(input.tags)) {
    field('tags', appendUnique(current.tags, input.tags.slice(0, 32).map((tag) => text(tag, 100)).filter(Boolean), (tag) => tag))
  }
  const links = [{ label: 'Bangumi', url: subject.url }, ...rowList(input.links, ['label', 'url'], (url) => /^https:\/\/bgm\.tv\/subject\/[1-9]\d{0,9}$/.test(url))]
  const existingLinks = Array.isArray(current.links) ? current.links : []
  const manual = existingLinks.find((link) => /^cbl$/i.test(link?.label || ''))
  if (manual && !['bgm.tv', 'bangumi.tv', 'chii.in'].some((host) =>
    [`https://${host}/subject/${subject.id}`, `http://${host}/subject/${subject.id}`].includes(String(manual.url).replace(/\/$/, '')))) {
    throw new MetadataError(409, 'BANGUMI_LINK_CONFLICT', 'Komga 已有指向另一条目的 cbl 链接，请先核对匹配。')
  }
  const otherLinks = existingLinks.filter((link) => link?.label !== 'Bangumi' || link.url === subject.url)
  const mergedLinks = appendUnique(otherLinks, links, (row) => row?.url)
  field('links', mergedLinks ?? otherLinks)
  return patch
}

function fingerprint(metadata, patch) {
  return JSON.stringify([...new Set(['links', ...Object.keys(patch)])].map((key) => [key, metadata[key], metadata[key + 'Lock']]))
}

export function createBangumiKomga({ url, komga, fetchImpl = fetch }) {
  const previews = new Map()
  const writes = new Set()
  let active = 0

  async function adapter(path, parameters) {
    if (!url) throw new MetadataError(503, 'BANGUMIKOMGA_UNCONFIGURED', '尚未启用 BangumiKomga 服务。')
    let base
    try { base = normalizeKomgaUrl(url) } catch {
      throw new MetadataError(503, 'BANGUMIKOMGA_CONFIGURATION', 'BangumiKomga 服务地址无效。')
    }
    if (!base) throw new MetadataError(503, 'BANGUMIKOMGA_CONFIGURATION', 'BangumiKomga 服务地址无效。')
    try {
      const response = await fetchImpl(`${base}/${path}?${new URLSearchParams(parameters)}`, {
        redirect: 'error', signal: AbortSignal.timeout(16000), headers: { accept: 'application/json' },
      })
      const data = await readAdapterJson(response)
      if (!response.ok) {
        const status = [404, 422, 429, 502, 504].includes(response.status) ? response.status : 502
        const code = /^BANGUMI_[A-Z_]+$/.test(data?.error?.code) ? data.error.code : 'BANGUMIKOMGA_HTTP_ERROR'
        throw new MetadataError(status, code, text(data?.error?.message, 200) || 'BangumiKomga 请求失败。')
      }
      return data
    } catch (error) {
      if (error instanceof MetadataError) throw error
      if (error?.name === 'TimeoutError') throw new MetadataError(504, 'BANGUMIKOMGA_TIMEOUT', 'BangumiKomga 响应超时。')
      throw new MetadataError(502, 'BANGUMIKOMGA_UNAVAILABLE', 'BangumiKomga 不可用或返回了无效数据。')
    }
  }

  async function preview(body) {
    const type = selection(body)
    if (!komgaId(body.seriesId) || (type.scope === 'book' && !komgaId(body.bookId)) || !subjectId(body.subjectId)) {
      throw new MetadataError(400, 'INVALID_METADATA_IDS', '请填写 Komga 系列 ID、Bangumi 条目 ID，以及单册 ID（单册模式）。')
    }
    const client = komga()
    const id = type.scope === 'series' ? body.seriesId : body.bookId
    const target = await client.metadataTarget(type.scope, id)
    if (target.seriesId !== body.seriesId) throw new MetadataError(409, 'BOOK_SERIES_MISMATCH', '该单册不属于指定系列。')
    const data = await adapter('metadata', { ...type, subjectId: body.subjectId })
    const subject = candidate(data?.subject)
    if (subject.id !== body.subjectId || !object(data.metadata)) {
      throw new MetadataError(502, 'INVALID_METADATA_RESPONSE', 'BangumiKomga 返回的条目与请求不一致。')
    }
    const patch = changes(target.metadata, data.metadata, type.scope, subject)
    const fields = Object.keys(patch)
    const result = { ...type, id, seriesId: target.seriesId, name: target.name, subject,
      changes: Object.fromEntries(fields.map((key) => [key, { before: target.metadata[key] ?? null, after: patch[key] }])),
    }
    if (!fields.length) return { ...result, previewId: null }
    const previewId = randomBytes(24).toString('base64url')
    if (previews.size >= MAX_PREVIEWS) previews.delete(previews.keys().next().value)
    previews.set(previewId, {
      ...type, id, result, client, patch, fingerprint: fingerprint(target.metadata, patch), expires: Date.now() + PREVIEW_MS,
    })
    return { ...result, previewId, expiresInSeconds: PREVIEW_MS / 1000 }
  }

  async function apply(body) {
    if (typeof body.previewId !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(body.previewId)) {
      throw new MetadataError(400, 'INVALID_PREVIEW_ID', '请提供有效的刮削预览 ID。')
    }
    const item = previews.get(body.previewId)
    if (!item || item.expires <= Date.now()) {
      previews.delete(body.previewId)
      throw new MetadataError(409, 'METADATA_PREVIEW_EXPIRED', '预览已过期或已使用，请重新生成。')
    }
    const key = `${item.scope}:${item.id}`
    if (writes.has(key)) throw new MetadataError(409, 'METADATA_UPDATE_BUSY', '已有更新正在写入此条目。')
    writes.add(key)
    try {
      const current = komga()
      if (current !== item.client) throw new MetadataError(409, 'KOMGA_CONFIGURATION_CHANGED', 'Komga 配置已改变，请重新预览。')
      const target = await current.metadataTarget(item.scope, item.id)
      if (target.seriesId !== item.result.seriesId || fingerprint(target.metadata, item.patch) !== item.fingerprint) {
        throw new MetadataError(409, 'METADATA_CHANGED', 'Komga 的当前元数据已改变，请重新预览。')
      }
      previews.delete(body.previewId)
      await current.patchMetadata(item.scope, item.id, item.patch)
      return { ...item.result, updated: true }
    } finally {
      writes.delete(key)
    }
  }

  return async function run(action, body) {
    if (!url) throw new MetadataError(503, 'BANGUMIKOMGA_UNCONFIGURED', '尚未启用 BangumiKomga 服务。')
    if (active >= 4) throw new MetadataError(429, 'METADATA_BUSY', '元数据服务繁忙，请稍后重试。')
    active += 1
    try {
      if (action === 'books') {
        const page = body.page ?? 0
        if (!komgaId(body.seriesId) || !Number.isInteger(page) || page < 0 || page > 10000) {
          throw new MetadataError(400, 'INVALID_METADATA_IDS', '请填写 Komga 系列 ID 和有效页码。')
        }
        return await komga().metadataBooks(body.seriesId, page)
      }
      if (action === 'apply') return await apply(body)
      if (action === 'preview') return await preview(body)
      const query = text(body.query, 201)
      if (!query || query.length > 200) throw new MetadataError(400, 'INVALID_QUERY', '请输入 1 至 200 个字符。')
      const type = selection(body)
      const data = await adapter('search', { ...type, query })
      if (!Array.isArray(data?.candidates)) throw new MetadataError(502, 'INVALID_METADATA_RESPONSE', 'BangumiKomga 返回了无效的搜索结果。')
      return { ...type, candidates: data.candidates.slice(0, 10).map(candidate) }
    } finally {
      active -= 1
    }
  }
}

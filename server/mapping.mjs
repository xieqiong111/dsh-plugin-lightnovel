/**
 * Backend domain records -> the exact DTO shapes consumed by web/src/types.
 *
 * Everything here is a pure projection. No value is invented: fields the plugin
 * does not have (rating, cover art, latency, success rate) are either zeroed or
 * explicitly null, and the UI labels them as unavailable instead of faking data.
 */
const THEMES = ['moon', 'flower', 'mountain', 'orb', 'city', 'rose', 'night', 'paper']

function hash(text) {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function art(seed) {
  const value = hash(String(seed))
  return { cover: THEMES[value % THEMES.length], coverIndex: value % 12 }
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

export function relativeTime(iso) {
  const time = Date.parse(iso ?? '')
  if (!Number.isFinite(time)) return '—'
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000))
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} 天前`
  return new Date(time).toISOString().slice(0, 10)
}

export function toNovel(book) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    ...art(book.id),
    volumes: Number(book.volumeCount) || 0,
    source: book.source,
    sourceId: book.sourceId,
    sourceUrl: book.sourceUrl,
    status: book.status === 'completed' || book.status === 'ongoing' ? book.status : 'unknown',
    statusText: book.statusText || '状态未知',
    summary: book.description || '该书源未提供简介。',
    tags: Array.isArray(book.tags) ? book.tags : [],
    rating: 0,
    updatedAt: (book.lastUpdated || book.indexedAt || '').slice(0, 10) || '—',
    isMock: false,
  }
}

/** Volume ids encode the 1-based index so POST /api/tasks can rebuild the Dart selector. */
export function toVolume(bookId, volume) {
  return {
    id: `${bookId}#v${volume.index}`,
    index: volume.index,
    name: volume.name || `第 ${volume.index} 卷`,
    chapters: Number(volume.chapterCount) || 0,
    updatedAt: '—',
  }
}

const TASK_STATE = {
  queued: 'queued',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  interrupted: 'failed',
}

const PHASE_LABEL = {
  queued: '排队中',
  starting: '正在启动',
  downloading: '正在抓取章节',
  packing: '正在打包 EPUB',
  completed: '已完成',
  failed: '已失败',
  cancelled: '已取消',
}

export function toTask(record) {
  const progress = record.progress ?? {}
  const volumeNames = record.request?.volumeNames ?? []
  const bytes = (record.artifacts ?? []).reduce((sum, item) => sum + (Number(item.bytes) || 0), 0)
  return {
    id: record.id,
    novelId: record.request?.bookId ?? '',
    title: record.request?.title ?? '未知书目',
    ...art(record.request?.bookId ?? record.id),
    state: TASK_STATE[record.state] ?? 'failed',
    percent: Number(progress.percent) || 0,
    volumeLabel:
      (record.downloadedVolumes ?? []).join('、') ||
      (volumeNames.length ? volumeNames.join('、') : `${progress.volumesTotal ?? 1} 卷`),
    chapterLabel: progress.currentChapter || PHASE_LABEL[progress.phase] || progress.phase || '等待开始',
    size: bytes > 0 ? formatBytes(bytes) : undefined,
    message: record.error?.message,
    updatedAt: relativeTime(record.updatedAt),
    isMock: false,
  }
}

export function toLibraryItem(entry) {
  return {
    id: entry.id,
    // Tasks store the composite id (fixture:book) as bookId; older index rows
    // may store the bare source-local id. Avoid producing "fixture:fixture:...".
    novelId: String(entry.bookId).includes(':')
      ? String(entry.bookId)
      : `${entry.sourceId}:${entry.bookId}`,
    title: entry.title,
    author: entry.author || '未知作者',
    fileName: entry.relativePath.split(/[\\/]/).pop() || entry.relativePath,
    ...art(entry.bookId || entry.id),
    volumes: Array.isArray(entry.volumeNames) && entry.volumeNames.length > 0 ? entry.volumeNames.length : 1,
    volumeLabel: (entry.volumeNames ?? []).join('、') || '单行本',
    size: formatBytes(entry.bytes),
    integrity: entry.integrity === 'ok' ? 'passed' : entry.integrity === 'failed' ? 'failed' : 'pending',
    addedAt: relativeTime(entry.createdAt),
    tags: [entry.sourceId, `${entry.chapterCount} 章`].filter(Boolean),
  }
}

export function toLibraryStats(runtime) {
  const stats = runtime.library.stats()
  const tasks = runtime.store.list()
  return {
    epubs: stats.total,
    tasks: tasks.length,
    queued: tasks.filter((task) => task.state === 'running' || task.state === 'queued').length,
    verified: stats.ok,
    bytes: stats.bytes,
    chapters: stats.chapters,
    failed: stats.failed,
  }
}

const ACTIVITY_TITLES = {
  ready: '插件运行时已就绪',
  applied: '插件已加载',
  details: '已读取小说详情',
  queued: '已创建下载任务',
  retry_queued: '任务已重新排队',
  cancelled: '任务已取消',
  finished: '下载任务结束',
  added: 'EPUB 已写入书库',
  replaced: '书库索引已去重',
  deduplicated_index: '书库索引自愈完成',
  integrity_failed: 'EPUB 完整性校验失败',
  source_rejected: '书源请求被拒绝',
  restricted_source_disabled: '受限书源已跳过',
  init_failed: '插件初始化失败',
}

export function toActivities(logger) {
  return logger
    .recent(60)
    .slice()
    .reverse()
    .filter((entry) => entry.level !== 'debug' && (ACTIVITY_TITLES[entry.event] || entry.level === 'error' || entry.level === 'warn'))
    .slice(0, 8)
    .map((entry, index) => {
      const fields = entry
      const title = fields.title || fields.relativePath || fields.bookId || fields.taskId
      const detail = title ? ` · ${String(title).slice(0, 40)}` : ''
      const failure = entry.level === 'error' || entry.level === 'warn' || /fail|reject|error/i.test(entry.event)
      const success = /added|finished|ready|completed/i.test(entry.event)
      return {
        id: `log_${index}_${entry.ts}`,
        kind: failure ? 'failure' : success ? 'success' : 'info',
        title: `${ACTIVITY_TITLES[entry.event] ?? `${entry.scope} · ${entry.event}`}${detail}`,
        time: relativeTime(entry.ts),
      }
    })
}

/**
 * Source cards describe configuration, not a live probe. `searchUrlConfigured`
 * reflects whether the operator explicitly enabled the opt-in search endpoint;
 * without it the public .net source has no keyword search (see LIVE-SOURCES.md).
 */
export function toSources(runtime, searchUrlConfigured) {
  return runtime.registry.describe().map((info) => ({
    id: info.id,
    name: info.name,
    host: info.baseUrl,
    description: info.note,
    state: info.live ? 'degraded' : 'online',
    latencyMs: null,
    successRate: null,
    searchable: info.live ? searchUrlConfigured : true,
    note: info.live
      ? searchUrlConfigured
        ? '已配置关键词搜索端点；仍遵守 robots.txt 与限速。'
        : '未提供可用的公开关键词搜索端点，默认不发起实时搜索；可用详情 URL 直达。状态来自运行时配置，未做实时探测。'
      : '离线确定性书源，无需外网；状态来自运行时配置，未做实时探测。',
    isMock: false,
  }))
}

/** Deliberately excludes absolute host paths (they are operator-private). */
export function toStatus(runtime, settings) {
  const status = runtime.status()
  const dart = status.dart ?? {}
  return {
    ok: true,
    apiMode: 'live',
    // Never leak host-specific absolute paths to browser clients.
    dart: {
      available: Boolean(dart.available),
      runner: dart.runner ? String(dart.runner).split(/[\\/]/).filter(Boolean).pop() : null,
      reason: dart.reason ?? null,
    },
    sources: status.sources,
    searchMode: status.searchMode,
    respectRobots: status.respectRobots,
    offlineOnly: status.offlineOnly,
    recentLogCount: status.recentLogCount,
    library: toLibraryStats(runtime),
    features: { delete: settings.allowDelete, token: Boolean(settings.token) },
  }
}

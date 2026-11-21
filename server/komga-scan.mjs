/** Throttle repeat requests per Komga connection and library. */
export function createKomgaScanner() {
  const requests = new WeakMap()
  return async function scan(client, id) {
    const now = Date.now()
    let recent = requests.get(client)
    if (!recent) {
      recent = new Map()
      requests.set(client, recent)
    }
    for (const [key, expires] of recent) if (expires <= now) recent.delete(key)
    if (recent.has(id)) return { accepted: false, message: '刚刚已请求刷新，请稍后再试。' }
    recent.set(id, Infinity)
    try {
      await client.scanLibrary(id)
      recent.set(id, Date.now() + 15_000)
      return { accepted: true, message: 'Komga 已接受扫描请求。' }
    } catch (error) {
      recent.delete(id)
      return { accepted: false, message: error?.code === 'AUTHENTICATION_FAILED'
        ? 'Komga 拒绝扫描。请使用拥有 Komga 管理员权限的 API Key。' : 'Komga 未确认扫描请求。' }
    }
  }
}

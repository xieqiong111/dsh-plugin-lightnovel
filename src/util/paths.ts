import path from 'node:path'

export class PathViolation extends Error {
  readonly code = 'PATH_VIOLATION'
  constructor(message: string) {
    super(message)
    this.name = 'PathViolation'
  }
}

/** Rejects absolute paths, `..`, NUL/control bytes and Windows drive tricks. */
export function assertSafeRelative(relative: string): string {
  if (typeof relative !== 'string' || relative.length === 0) {
    throw new PathViolation('Empty relative path')
  }
  if (/[\u0000-\u001f]/.test(relative)) {
    throw new PathViolation('Control character in path')
  }
  if (path.isAbsolute(relative) || /^[a-zA-Z]:[\\/]/.test(relative) || relative.startsWith('\\\\')) {
    throw new PathViolation(`Absolute path is not allowed: ${relative}`)
  }
  const normalised = path.normalize(relative)
  if (normalised === '..' || normalised.startsWith(`..${path.sep}`) || normalised.includes(`/..${path.sep}`)) {
    throw new PathViolation(`Path traversal is not allowed: ${relative}`)
  }
  return normalised
}

/** Resolve inside `root` and prove the result did not escape. */
export function safeResolve(root: string, ...parts: string[]): string {
  const absoluteRoot = path.resolve(root)
  const target = path.resolve(absoluteRoot, ...parts.map((p) => p.replace(/^[/\\]+/, '')))
  const rel = path.relative(absoluteRoot, target)
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new PathViolation(`Escaped root ${absoluteRoot}: ${parts.join('/')}`)
  }
  return target
}

/** Filesystem-safe single path segment derived from an untrusted book title. */
export function sanitizeFileName(name: string, fallback = 'untitled'): string {
  let out = name.normalize('NFKC')
    .replace(/[\u0000-\u001f<>:"\\/|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
  if (out.length > 120) out = out.slice(0, 120).trim()
  if (out.length === 0 || out === '.' || out === '..') out = fallback
  // Windows reserved device names still matter on NAS SMB shares.
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(out)) out = `_${out}`
  return out
}

export class UrlViolation extends Error {
  readonly code = 'URL_VIOLATION'
  constructor(message: string) {
    super(message)
    this.name = 'UrlViolation'
  }
}

/**
 * SSRF / compliance guard. Only public http(s) URLs on standard ports are
 * accepted; credentials, localhost and private ranges are refused. We never
 * send cookies or Authorization headers, so login/paywall bypass is impossible.
 */
export function assertSafePublicUrl(raw: string, allowedHosts?: readonly string[]): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UrlViolation(`Malformed URL: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlViolation(`Unsupported scheme: ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new UrlViolation('Credentials embedded in URL are refused')
  }
  if (url.port && !['80', '443'].includes(url.port)) {
    throw new UrlViolation(`Non-standard port is refused: ${url.port}`)
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (isPrivateHost(host)) throw new UrlViolation(`Private host is refused: ${host}`)
  if (allowedHosts && allowedHosts.length > 0) {
    const ok = allowedHosts.some((allowed) => host === allowed.toLowerCase() || host.endsWith(`.${allowed.toLowerCase()}`))
    if (!ok) throw new UrlViolation(`Host not in source allowlist: ${host}`)
  }
  return url
}

export function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host === '::1' || host === '0.0.0.0' || host === '::') return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 10 || a === 127 || a === 0 || a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true
  }
  // IPv6 unique-local / link-local.
  if (/^f[cd]/i.test(host) || /^fe[89ab]/i.test(host)) return true
  return false
}

/**
 * Build-time/runtime switches for the two data sources.
 *
 * VITE_API_MODE=mock (default) -> self-contained static prototype, no backend.
 * VITE_API_MODE=live          -> every call goes to the BFF (/api/*), which
 *                                directly drives the plugin's PluginRuntime.
 *
 * The token is read from localStorage at runtime, never baked into the bundle.
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

export const API_MODE: 'mock' | 'live' = env.VITE_API_MODE === 'live' ? 'live' : 'mock'
export const IS_LIVE = API_MODE === 'live'
export const API_BASE = (env.VITE_API_BASE || '/api').replace(/\/+$/, '')

export interface RuntimeStatus {
  ok: boolean
  apiMode: 'live'
  dart: { available: boolean; runner: string | null; reason: string | null }
  sources: Array<{ id: string; name: string; baseUrl: string; access: string; live: boolean; note: string }>
  searchMode: string
  respectRobots: boolean
  offlineOnly: boolean
  recentLogCount: number
  library: { epubs: number; tasks: number; queued: number; verified: number; bytes: number; chapters: number; failed: number }
  features: { delete: boolean; token: boolean }
}

const TOKEN_KEY = 'ln_api_token'

export function getApiToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setApiToken(value: string): void {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode: token simply cannot be persisted */
  }
}

function headers(init?: RequestInit): Headers {
  const result = new Headers(init?.headers)
  if (init?.body && !result.has('content-type')) result.set('content-type', 'application/json')
  const token = getApiToken()
  if (token) result.set('x-ln-token', token)
  return result
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs: number) {
    super(message)
  }
}

function apiError(response: Response, message = `${response.status} ${response.statusText}`) {
  const seconds = Number(response.headers.get('retry-after'))
  return new ApiError(message, response.status, Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0)
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: headers(init) })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      if (body?.error?.message) message = body.error.message
    } catch {
      /* keep the status text */
    }
    throw apiError(response, message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function apiFetchBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(`${API_BASE}${path}`, { headers: headers(), signal, redirect: 'error' })
  if (!response.ok) throw apiError(response)
  return response.blob()
}

export async function apiDownload(path: string, fileName: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, { headers: headers() })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const DEMO = {
  get label() {
    return IS_LIVE ? '实时数据' : '演示数据'
  },
  get badge() {
    return IS_LIVE ? '实时数据' : '交互原型 · 非真实数据'
  },
}

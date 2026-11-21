import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { BookOpen, LogOut } from 'lucide-react'
import { Badge, Button, Card, Spinner } from '@/components/common/ui'
import { apiFetch, IS_LIVE, setApiToken } from '@/services/runtime'

type Status = { enabled: false } | {
  enabled: true
  needsSetup: boolean
  username: string | null
  expiresAt: number | null
  durations: number[]
}
const labels: Record<number, string> = { 28800: '8 小时', 86400: '1 天', 604800: '7 天', 2592000: '30 天' }
const inputStyle = 'mt-1 block h-11 w-full rounded-xl border border-[#E7E0FA] bg-[#FBFAFE] px-3 text-sm outline-none focus:border-[#7E5EE9]'

const post = (action: string, body: object = {}) => apiFetch<Status>(`/auth/${action}`, {
  method: 'POST',
  body: JSON.stringify(body),
})

export function StudioLogin({ children }: { children: ReactNode }) {
  return IS_LIVE ? <LoginGate>{children}</LoginGate> : children
}

function LoginGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const check = useCallback(async () => {
    try {
      const current = await apiFetch<Status>('/auth/status')
      if (current.enabled) setApiToken('')
      setStatus(current)
      setError('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法读取登录状态。')
    }
  }, [])
  useEffect(() => { void check() }, [check])

  const expiresAt = status?.enabled ? status.expiresAt : null
  useEffect(() => {
    if (!expiresAt) return
    const expire = () => {
      setStatus((current) => current?.enabled ? { ...current, username: null, expiresAt: null } : current)
      void check()
    }
    let timer: number
    const schedule = () => {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) expire()
      else timer = window.setTimeout(schedule, Math.min(remaining, 2_147_000_000))
    }
    const onUnauthorized = () => { void check() }
    schedule()
    window.addEventListener('studio:unauthorized', onUnauthorized)
    window.addEventListener('focus', onUnauthorized)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('studio:unauthorized', onUnauthorized)
      window.removeEventListener('focus', onUnauthorized)
    }
  }, [check, expiresAt])

  if (status && !status.enabled) return children
  if (status?.enabled && status.username) {
    const username = status.username
    const logout = async () => {
      setBusy(true)
      try {
        await post('logout')
        setStatus({ ...status, username: null, expiresAt: null })
        setError('')
      } catch {
        setError('退出失败，请重试。')
      } finally {
        setBusy(false)
      }
    }
    return (
      <>
        {children}
        <div className="fixed bottom-3 right-3 z-40 flex items-center gap-2 rounded-xl border border-[#EFEDF6] bg-white px-2 py-1 shadow-card">
          {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
          <span className="hidden max-w-32 truncate text-xs text-[#6B6B85] sm:inline" title={`会话有效期至 ${new Date(expiresAt ?? 0).toLocaleString()}`}>{username}</span>
          <Button size="sm" loading={busy} disabled={busy} icon={<LogOut className="h-3.5 w-3.5" />} onClick={() => void logout()}>退出登录</Button>
        </div>
      </>
    )
  }

  const creating = status?.enabled && status.needsSetup
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const password = String(fields.get('password') ?? '')
    if (creating && password !== fields.get('confirm')) {
      setError('两次输入的密码不一致。')
      return
    }
    setBusy(true)
    setError('')
    try {
      setStatus(await post(creating ? 'setup' : 'login', {
        username: fields.get('username'),
        password,
        setupCode: creating ? fields.get('setupCode') : undefined,
        seconds: Number(fields.get('seconds')),
      }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '操作失败，请重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top_left,#EDE7FF,#F8F7FC_65%)] px-4 py-8">
      <Card className="w-full max-w-[440px] p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#7555DD] text-white"><BookOpen className="h-5 w-5" /></div>
          <span className="text-sm font-semibold text-[#373452]">轻小说与漫画书库</span>
        </div>
        <h1 className="mt-5 text-2xl font-bold text-[#22233B]">{creating ? '创建管理员账号' : '登录 Studio'}</h1>
        {creating && <Badge className="mt-2">首次设置</Badge>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
        {!status ? (error
          ? <Button className="mt-4" onClick={() => void check()}>重试</Button>
          : <p className="mt-4 text-sm text-[#6B6B85]" role="status"><Spinner /> 正在检查登录状态…</p>
        ) : status.enabled && (
          <form key={creating ? 'setup' : 'login'} className="mt-5 space-y-3.5" onSubmit={(event) => void submit(event)}>
            {creating && (
              <label className="block text-sm font-medium text-[#393951]">
                初始化码
                <input name="setupCode" type="password" autoComplete="off" required className={inputStyle} />
                <span className="mt-1 block text-xs font-normal text-[#6B6B85]">使用部署时设置的初始化码。未配置时，从 NAS 的 auth/setup-code 文件读取。</span>
              </label>
            )}
            <label className="block text-sm font-medium text-[#393951]">
              账号
              <input name="username" autoComplete="username" required maxLength={40} className={inputStyle} />
            </label>
            <label className="block text-sm font-medium text-[#393951]">
              密码
              <input name="password" type="password" autoComplete={creating ? 'new-password' : 'current-password'}
                required minLength={creating ? 10 : undefined} maxLength={256} className={inputStyle} />
              {creating && <span className="mt-1 block text-xs font-normal text-[#6B6B85]">至少 10 个字符。</span>}
            </label>
            {creating && (
              <label className="block text-sm font-medium text-[#393951]">
                确认密码
                <input name="confirm" type="password" autoComplete="new-password" required className={inputStyle} />
              </label>
            )}
            <label className="block text-sm font-medium text-[#393951]">
              此设备免登录时长
              <select name="seconds" className={inputStyle} defaultValue={status.durations[0]}>
                {status.durations.map((seconds) => <option key={seconds} value={seconds}>{labels[seconds] ?? `${seconds} 秒`}</option>)}
              </select>
            </label>
            <Button type="submit" variant="primary" className="w-full" disabled={busy} loading={busy}>
              {creating ? '创建账号并登录' : '登录'}
            </Button>
          </form>
        )}
      </Card>
    </main>
  )
}

import { useState } from 'react'
import { Button, Card, SectionTitle, Spinner } from '@/components/common/ui'
import { useAsync } from '@/hooks/useAsync'
import { apiFetch } from '@/services/runtime'
import { useToast } from '@/components/common/Toast'

interface IntegrationStatus {
  komga: { url: string; allowedUrls: string[]; hasKey: boolean }
  dsh: { active: boolean; createdAt: string | null }
  token?: string
}

const endpoint = '/settings/integrations'
const input = 'mt-1 w-full rounded-lg border border-line bg-surface-soft px-3 py-2 text-sm outline-none focus:border-[#7E5EE9]'

export function IntegrationSettings() {
  const status = useAsync(() => apiFetch<IntegrationStatus>(endpoint), [])
  if (status.loading) return <p role="status"><Spinner /> 读取集成设置…</p>
  if (status.error) return <p role="alert" className="text-sm text-negative">{status.error}</p>
  return status.data && <IntegrationForm initial={status.data} />
}

function IntegrationForm({ initial }: { initial: IntegrationStatus }) {
  const { toast } = useToast()
  const [status, setStatus] = useState(initial)
  const [url, setUrl] = useState(initial.komga.allowedUrls.includes(initial.komga.url)
    ? initial.komga.url : initial.komga.allowedUrls[0] ?? '')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [confirm, setConfirm] = useState<'rotate-dsh' | 'revoke-dsh' | null>(null)

  const update = async (action: string) => {
    setBusy(true)
    setError('')
    try {
      const next = await apiFetch<IntegrationStatus>(endpoint, { method: 'POST',
        body: JSON.stringify(action === 'save-komga' ? { action, url, apiKey: apiKey.trim() } : { action }) })
      setStatus(next)
      if (action === 'save-komga') {
        setApiKey('')
        toast({ tone: 'success', title: 'Komga 已验证并保存' })
      } else {
        setToken(next.token ?? '')
        setConfirm(null)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '保存失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-5 p-5">
      <SectionTitle title="服务集成" />
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void update('save-komga') }}>
        <h3 className="text-sm font-semibold text-ink">Komga API</h3>
        <label className="block text-xs text-ink-soft">Komga 地址
          <input className={input} aria-label="Komga 地址" value={url} list="komga-addresses"
            onChange={(event) => setUrl(event.target.value)} required disabled={!initial.komga.allowedUrls.length || busy} />
          <datalist id="komga-addresses">{initial.komga.allowedUrls.map((address) => <option key={address} value={address} />)}</datalist>
        </label>
        {!initial.komga.allowedUrls.length && <p className="text-xs text-ink-soft">在部署环境变量 LN_KOMGA_ALLOWED_URLS 中加入 Komga 地址后即可填写密钥。</p>}
        <label className="block text-xs text-ink-soft">Komga API Key
          <input type="password" name="komga-api-key" autoComplete="off" className={input} value={apiKey} maxLength={512}
            placeholder={status.komga.hasKey ? '已保存 · 输入新密钥可替换' : '粘贴 Komga 中生成的 API Key'}
            onChange={(event) => setApiKey(event.target.value)} required disabled={!initial.komga.allowedUrls.length || busy} />
        </label>
        <Button type="submit" variant="primary" size="sm" disabled={busy || !apiKey.trim() || !url}>测试并保存</Button>
      </form>
      <div className="space-y-3 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink">DSH 只读 API</h3>
        <p className="text-xs text-ink-soft">使用 Bearer 密钥查询书库和任务状态。{status.dsh.active ? '已有有效密钥。' : '尚未生成密钥。'}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => status.dsh.active ? setConfirm('rotate-dsh') : void update('rotate-dsh')}>
            {status.dsh.active ? '重新生成密钥' : '生成只读密钥'}
          </Button>
          {status.dsh.active && <Button size="sm" disabled={busy} onClick={() => setConfirm('revoke-dsh')}>撤销密钥</Button>}
        </div>
        {confirm && <div className="space-y-2 rounded-lg bg-surface-soft p-3">
          <p className="text-xs text-ink-soft">确认后，当前密钥立即失效。</p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void update(confirm)}>确认</Button>
            <Button size="sm" disabled={busy} onClick={() => setConfirm(null)}>取消</Button>
          </div>
        </div>}
        {token && <label className="block text-xs text-ink-soft">新密钥仅显示这一次，请复制到 DSH 的密钥文件。
          <input aria-label="新 DSH 密钥" readOnly value={token} className={input} onFocus={(event) => event.target.select()} />
        </label>}
      </div>
      {error && <p role="alert" className="text-xs text-negative">{error}</p>}
    </Card>
  )
}

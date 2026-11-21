import { useEffect, useState } from 'react'
import { FolderOpen, Save } from 'lucide-react'
import { Button, Card, SectionTitle, Spinner } from '@/components/common/ui'
import { apiFetch } from '@/services/runtime'
import { useAsync } from '@/hooks/useAsync'
import { useToast } from '@/components/common/Toast'

type Kind = 'novel' | 'manga'
type Folder = { enabled: boolean; root: string | null; folder: string | null; legacyFolder?: string }
type Folders = Record<Kind, Folder>
const endpoint = '/settings/download-folders'
const inputStyle = 'w-full rounded-lg border border-[#EFEDF6] bg-[#FBFAFE] px-3 py-2 text-sm focus:border-[#7E5EE9] focus:outline-none'

export function DownloadFolders() {
  const catalog = useAsync(() => apiFetch<Folders>(endpoint), [])
  return (
    <Card className="p-5">
      <SectionTitle title="下载保存目录" />
      <p className="mb-4 mt-2 text-xs text-[#6B6B85]">轻小说 EPUB 和漫画 CBZ 可以分别选择目录。修改后，已保存的文件留在原处。</p>
      {catalog.loading && <p role="status"><Spinner /> 读取保存目录…</p>}
      {catalog.error && <p role="alert" className="text-sm text-red-700">{catalog.error}</p>}
      {catalog.data && <div className="grid gap-4 md:grid-cols-2">
        <FolderPicker kind="novel" label="轻小说 EPUB" initial={catalog.data.novel} />
        <FolderPicker kind="manga" label="漫画 CBZ" initial={catalog.data.manga} />
      </div>}
    </Card>
  )
}

function FolderPicker({ kind, label, initial }: { kind: Kind; label: string; initial: Folder }) {
  const { toast } = useToast()
  const [saved, setSaved] = useState(initial)
  const [folder, setFolder] = useState(initial.folder ?? '')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const browse = useAsync(() => initial.enabled ? apiFetch<{ entries: string[] }>(
    `${endpoint}/browse?${new URLSearchParams({ kind, folder })}`,
  ) : Promise.resolve({ entries: [] }), [folder, refresh, initial.enabled])

  useEffect(() => { setName(''); setError('') }, [folder])

  const save = async (target: string | null, create = false) => {
    setError('')
    setBusy(true)
    try {
      const result = await apiFetch<Folders>(endpoint, {
        method: 'POST', body: JSON.stringify({ kind, folder: target, create }),
      })
      setSaved(result[kind])
      setFolder(target ?? '')
      setName('')
      setRefresh((current) => current + 1)
      toast({ tone: 'success', title: `${label}目录已保存` })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '保存失败。')
    } finally {
      setBusy(false)
    }
  }

  const current = saved.folder === null ? saved.legacyFolder : [saved.root, saved.folder].filter(Boolean).join('/')
  return (
    <section className="min-w-0 rounded-xl border border-[#EFEDF6] p-4">
      <h3 className="text-sm font-semibold text-[#2B2C44]">{label}</h3>
      {!initial.enabled ? (
        <p className="mt-2 text-xs text-[#6B6B85]">当前实例未挂载可选目录。</p>
      ) : (
        <div className="mt-2 space-y-2.5">
          <p className="break-all text-xs text-[#6B6B85]">正在使用 {current}</p>
          <p className="break-all text-xs text-[#5C4199]">{[initial.root, folder].filter(Boolean).join('/')}</p>
          <div className="flex gap-2">
            {folder && <Button size="sm" disabled={busy} onClick={() => setFolder(folder.split('/').slice(0, -1).join('/'))}>上一级</Button>}
            <select aria-label={`浏览${label}目录`} className={inputStyle} value=""
              disabled={busy || browse.loading || Boolean(browse.error) || !browse.data?.entries.length}
              onChange={(event) => setFolder([folder, event.target.value].filter(Boolean).join('/'))}>
              <option value="">{browse.loading ? '读取子目录…' : browse.data?.entries.length ? '打开子目录' : '没有可选子目录'}</option>
              {browse.data?.entries.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} disabled={busy || browse.loading || Boolean(browse.error)}
              onClick={() => void save(folder)}>使用此目录</Button>
            {kind === 'novel' && saved.folder !== null && <Button size="sm" disabled={busy} onClick={() => void save(null)}>恢复原默认路径</Button>}
          </div>
          <form className="flex flex-wrap gap-2" onSubmit={(event) => {
            event.preventDefault()
            void save([folder, name.trim()].filter(Boolean).join('/'), true)
          }}>
            <input className={inputStyle} aria-label={`新建${label}目录名称`} placeholder="新子目录名称" maxLength={100} required value={name}
              onChange={(event) => setName(event.target.value)} />
            <Button type="submit" size="sm" icon={<FolderOpen className="h-3.5 w-3.5" />} disabled={busy || browse.loading || Boolean(browse.error) || !name.trim() || /[\\/]/.test(name)}>新建并使用</Button>
          </form>
          {(error || browse.error) && <p role="alert" className="text-xs text-red-700">{error || browse.error}</p>}
        </div>
      )}
    </section>
  )
}

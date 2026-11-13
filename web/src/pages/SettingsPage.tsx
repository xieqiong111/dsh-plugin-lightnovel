import { useState } from 'react'
import type { ReactNode } from 'react'
import { Database, Info, Palette, Save, Server, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Badge, Button, Card, SectionTitle } from '@/components/common/ui'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { useToast } from '@/components/common/Toast'
import { cn } from '@/services/utils'

export function SettingsPage() {
  const { toast } = useToast()
  const [apiBase, setApiBase] = useState('http://127.0.0.1:8080/api')
  const [poll, setPoll] = useState('2000')
  const [concurrency, setConcurrency] = useState('2')
  const [combine, setCombine] = useState(false)
  const [addTitle, setAddTitle] = useState(true)
  const [motion, setMotion] = useState(true)
  const [resetOpen, setResetOpen] = useState(false)

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="系统设置"
        description="前端演示用配置面板。除界面偏好外，所有与后端相关的字段都不会真正保存或生效。"
        actions={
          <>
            <Badge tone="amber" className="h-7 px-3">未持久化</Badge>
            <Button
              variant="primary"
              size="sm"
              icon={<Save className="h-3.5 w-3.5" />}
              onClick={() => toast({ tone: 'info', title: '配置未保存', description: '后端配置接口尚未实现，本次修改仅在当前页面会话中生效。' })}
            >
              保存设置
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <SectionTitle title="连接与接口" className="[&_h2]:text-[18px]" />
              <Badge tone="gray"><Server className="h-3 w-3" /> 待接入</Badge>
            </div>
            <div className="mt-4 space-y-3.5">
              <Field label="API 基础地址" hint="建议仅在内网或 Cloudflare Access 会话内暴露">
                <input
                  value={apiBase}
                  onChange={(event) => setApiBase(event.target.value)}
                  className="h-10 w-full rounded-[10px] border border-[#EFEDF6] bg-[#FBFAFE] px-3 font-mono text-[11px] text-[#3F4058] focus:border-[#C4B5FB] focus:bg-white focus:outline-none"
                />
              </Field>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="任务轮询间隔" hint="任务页刷新频率">
                  <Select value={poll} onChange={setPoll} options={[['1000', '1 秒'], ['2000', '2 秒'], ['5000', '5 秒'], ['10000', '10 秒']]} />
                </Field>
                <Field label="并发下载数" hint="受书源限速约束">
                  <Select value={concurrency} onChange={setConcurrency} options={[['1', '1 个'], ['2', '2 个'], ['3', '3 个'], ['5', '5 个']]} />
                </Field>
              </div>
              <Field label="会话与认证" hint="生产环境应启用 CSRF 防护与请求体限制">
                <div className="flex h-10 items-center justify-between rounded-[10px] border border-[#EFEDF6] bg-[#FBFAFE] px-3 text-[11px] text-[#8B8BA0]">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#10B981]" />
                    LAN Session · 演示身份
                  </span>
                  <span className="text-[9.5px] text-[#B5B5C6]">只读</span>
                </div>
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="下载与打包" className="[&_h2]:text-[18px]" right={<Badge tone="violet">EPUB</Badge>} />
            <div className="mt-4 space-y-2.5">
              <SwitchRow label="默认合并为单一 EPUB" description="多卷打包为一个文件" checked={combine} onChange={setCombine} />
              <SwitchRow label="默认添加章节标题" description="保留原站目录结构" checked={addTitle} onChange={setAddTitle} />
              <SwitchRow
                label="启用界面动效"
                description="卡片悬浮、进度与弹窗过渡"
                checked={motion}
                onChange={(next) => {
                  setMotion(next)
                  toast({ tone: 'info', title: next ? '动效已开启（仅本页会话）' : '动效已关闭（仅本页会话）' })
                }}
              />
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="外观" className="[&_h2]:text-[18px]" right={<Palette className="h-4 w-4 text-[#A78BFA]" />} />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { name: '浅色 · 紫雾', colors: ['#F7F7FC', '#7E5EE9', '#262352'], active: true },
                { name: '深色 · 夜航', colors: ['#171632', '#8B63F2', '#C4B5FB'], active: false },
                { name: '跟随系统', colors: ['#FFFFFF', '#A78BFA', '#EFEDF6'], active: false },
              ].map((theme) => (
                <button
                  key={theme.name}
                  type="button"
                  onClick={() => toast({ tone: 'info', title: `${theme.name} 主题为占位`, description: '本轮只交付参考图的浅色主题。' })}
                  className={cn(
                    'rounded-[12px] border p-3 text-left transition',
                    theme.active ? 'border-[#C4B5FB] bg-[#FBFAFF]' : 'border-[#EFEDF6] bg-white hover:border-[#DCD4F7]',
                  )}
                >
                  <div className="flex gap-1.5">
                    {theme.colors.map((color) => (
                      <span key={color} className="h-5 flex-1 rounded-[5px]" style={{ background: color }} />
                    ))}
                  </div>
                  <p className="mt-2 flex items-center justify-between text-[10px] text-[#5B5B73]">
                    {theme.name}
                    {theme.active && <span className="text-[9px] text-[#6C4AD9]">当前</span>}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="border-[#FADCE6] p-5">
            <SectionTitle title="危险操作" className="[&_h2]:text-[18px]" right={<Badge tone="rose">谨慎</Badge>} />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11.5px] font-semibold text-[#3F4058]">清空本地演示缓存</p>
                <p className="mt-1 text-[10px] leading-relaxed text-[#A2A2B6]">
                  仅清除浏览器中的界面状态，不会删除磁盘上的 EPUB 文件。
                </p>
              </div>
              <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setResetOpen(true)}>
                清空缓存
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle title="运行信息" className="[&_h2]:text-[17px]" />
            <div className="mt-3.5 space-y-2.5 text-[10px]">
              {[
                ['前端版本', 'Lightnovel Studio 1.0.0'],
                ['插件版本', 'dsh-plugin-lightnovel 1.0.0'],
                ['运行模式', 'Mock · 前端原型'],
                ['数据接口', '未接入'],
                ['构建工具', 'Vite + React 18'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-[#A2A2B6]">{label}</span>
                  <span className="text-right text-[#5B5B73]">{value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="实现说明" className="[&_h2]:text-[17px]" />
            <p className="mt-3 text-[10px] leading-[1.9] text-[#8B8BA0]">
              API 契约见仓库根目录 <span className="font-mono text-[9px] text-[#6C4AD9]">API-CONTRACT.md</span>。
              该文件明确说明这些端点为「计划接口」，仓库当前并不存在 HTTP 服务。因此在接入前，页面统一使用
              <span className="mx-1 rounded bg-[#F1EDFE] px-1.5 py-0.5 text-[#6C4AD9]">Mock 数据层</span>
              并在界面上持续标注。
            </p>
            <div className="mt-3 flex items-start gap-1.5 rounded-[8px] bg-[#FBFAFE] px-2.5 py-2 text-[9.5px] leading-relaxed text-[#A2A2B6]">
              <Info className="mt-[1px] h-3 w-3 shrink-0 text-[#C4B5FB]" />
              自动追更、书库导入、真实配置持久化尚未实现，均以禁用或占位形式呈现。
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="维护入口" className="[&_h2]:text-[17px]" />
            <div className="mt-3 space-y-2">
              <a href="https://github.com/xieqiong111/dsh-plugin-lightnovel" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-[9px] border border-[#F1EFF8] px-3 py-2 text-[10.5px] text-[#6B6B85] transition hover:border-[#DCD4F7] hover:text-[#6C4AD9]">
                <Database className="h-3.5 w-3.5 text-[#A78BFA]" />
                GitHub 仓库
              </a>
              <div className="flex items-center gap-2 rounded-[9px] border border-[#F1EFF8] px-3 py-2 text-[10.5px] text-[#A2A2B6]">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#C4B5FB]" />
                配置接口 · 待实现
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        eyebrow="Confirm"
        title="清空本地演示缓存？"
        width="max-w-[420px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setResetOpen(false)}>取消</Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setResetOpen(false)
                toast({ tone: 'warning', title: '演示缓存已清空', description: '仅重置本地 UI 状态，未触碰真实文件或数据库。' })
              }}
            >
              确认清空
            </Button>
          </div>
        }
      >
        <p className="px-6 py-5 text-[11.5px] leading-relaxed text-[#6B6B85]">
          此操作会重置筛选、视图模式等前端状态。由于当前没有后端配置存储，不会影响插件运行。
        </p>
      </Modal>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-medium text-[#5B5B73]">{label}</span>
        {hint && <span className="text-[9px] text-[#B5B5C6]">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (next: string) => void
  options: [string, string][]
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-[10px] border border-[#EFEDF6] bg-[#FBFAFE] px-2.5 text-[11px] text-[#3F4058] focus:border-[#C4B5FB] focus:bg-white focus:outline-none"
    >
      {options.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  )
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-[#F1EFF8] bg-white px-3 py-2.5 text-left transition hover:bg-[#FBFAFE]"
    >
      <span>
        <span className="block text-[11px] font-semibold text-[#3F4058]">{label}</span>
        <span className="mt-0.5 block text-[9.5px] text-[#A2A2B6]">{description}</span>
      </span>
      <span className={cn('relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors', checked ? 'bg-[#7E5EE9]' : 'bg-[#E5E1F1]')}>
        <span className={cn('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-all', checked ? 'left-[16px]' : 'left-[2px]')} />
      </span>
    </button>
  )
}

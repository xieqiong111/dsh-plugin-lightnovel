import { useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, Globe2, RefreshCw, ShieldAlert, Zap } from 'lucide-react'
import { Badge, Button, Card, SectionTitle } from '@/components/common/ui'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { useToast } from '@/components/common/Toast'
import { sources } from '@/data/mock'
import type { SourceHealth } from '@/types'
import { cn } from '@/services/utils'

const stateMeta: Record<SourceHealth['state'], { label: string; tone: 'green' | 'amber' | 'rose'; dot: string }> = {
  online: { label: '在线', tone: 'green', dot: 'bg-[#10B981]' },
  degraded: { label: '降级', tone: 'amber', dot: 'bg-[#F59E0B]' },
  offline: { label: '离线', tone: 'rose', dot: 'bg-[#F472B6]' },
}

export function SourcesPage() {
  const { toast } = useToast()
  const [logSource, setLogSource] = useState<SourceHealth | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    bilinovel: true,
    fixture: true,
    local: true,
    web: false,
  })

  const test = (source: SourceHealth) => {
    setTesting(source.id)
    window.setTimeout(() => {
      setTesting(null)
      toast({
        tone: source.state === 'degraded' ? 'warning' : 'success',
        title: `${source.name} 连接测试完成`,
        description: `模拟延迟 ${source.latencyMs ?? '—'} ms · 成功率 ${source.successRate ?? '—'}%（非真实探测）`,
      })
    }, 900)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Source health"
        title="书源状态"
        description="只读诊断面板。当前状态来自 Mock 配置，真实健康检查需接入 GET /api/status 与日志接口。"
        actions={
          <>
            <Badge tone="amber" className="h-7 px-3">
              <ShieldAlert className="h-3 w-3" />
              只读诊断
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => toast({ tone: 'info', title: '已刷新书源状态', description: '演示数据保持不变。' })}
            >
              重新探测
            </Button>
          </>
        }
      />

      <div className="mb-5 flex items-start gap-2 rounded-[12px] border border-[#E9E4FA] bg-[#FBFAFF] px-4 py-3 text-[10.5px] leading-relaxed text-[#8B8BA0]">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A78BFA]" />
        <span>
          书源启用开关仅作为前端配置占位，不会修改插件运行时。Bilinovel 默认缺少公开关键词搜索入口，建议使用 URL 直达详情。
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sources.map((source) => {
          const meta = stateMeta[source.state]
          return (
            <Card key={source.id} hoverable className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#F6F3FF] text-[#7E5EE9]">
                  <Globe2 className="h-[19px] w-[19px]" strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-[#2B2C44]">{source.name}</p>
                    <Badge tone={meta.tone}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                      {meta.label}
                    </Badge>
                    {!source.searchable && <Badge tone="gray">不可搜索</Badge>}
                  </div>
                  <p className="mt-1 font-mono text-[9.5px] text-[#A2A2B6]">{source.host}</p>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-[#7A7A92]">{source.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled[source.id]}
                  aria-label={`启用 ${source.name}`}
                  onClick={() => {
                    setEnabled((prev) => ({ ...prev, [source.id]: !prev[source.id] }))
                    toast({ tone: 'info', title: `${enabled[source.id] ? '已停用' : '已启用'} ${source.name}（前端占位）` })
                  }}
                  className={cn(
                    'relative mt-1 h-[18px] w-[32px] shrink-0 rounded-full transition-colors',
                    enabled[source.id] ? 'bg-[#7E5EE9]' : 'bg-[#E5E1F1]',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all',
                      enabled[source.id] ? 'left-[16px]' : 'left-[2px]',
                    )}
                  />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <div className="rounded-[10px] border border-[#F1EFF8] bg-[#FBFAFE] px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[9.5px] text-[#A2A2B6]">
                    <Zap className="h-3 w-3 text-[#A78BFA]" />
                    平均延迟
                  </p>
                  <p className="mt-1 text-[15px] font-bold text-[#25263C]">
                    {source.latencyMs ?? '—'}
                    <span className="ml-1 text-[9px] font-normal text-[#A2A2B6]">ms</span>
                  </p>
                </div>
                <div className="rounded-[10px] border border-[#F1EFF8] bg-[#FBFAFE] px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[9.5px] text-[#A2A2B6]">
                    <Activity className="h-3 w-3 text-[#A78BFA]" />
                    成功率
                  </p>
                  <span className="mt-1 block text-[15px] font-bold leading-none text-[#25263C]">
                    {source.successRate ?? '—'}
                    <span className="ml-0.5 text-[9px] font-normal text-[#A2A2B6]">%</span>
                  </span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0EDF9]">
                      <span
                        className={cn(
                          'block h-full rounded-full',
                          source.state === 'degraded' ? 'bg-[#F59E0B]' : 'bg-[#10B981]',
                        )}
                        style={{ width: `${source.successRate ?? 0}%` }}
                      />
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#F5F3FA] pt-3">
                <span className="text-[9.5px] text-[#A2A2B6]">{source.note}</span>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setLogSource(source)}>
                    诊断日志
                  </Button>
                  <Button variant="soft" size="sm" loading={testing === source.id} onClick={() => test(source)}>
                    测试连接
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="mt-5 p-5">
        <SectionTitle title="能力矩阵" className="[&_h2]:text-[17px]" right={<Badge tone="amber">Mock</Badge>} />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[10.5px]">
            <thead>
              <tr className="border-b border-[#F3F1F9] text-[9.5px] text-[#A2A2B6]">
                <th className="pb-2 font-medium">书源</th>
                <th className="pb-2 font-medium">关键词搜索</th>
                <th className="pb-2 font-medium">URL 直达</th>
                <th className="pb-2 font-medium">分卷读取</th>
                <th className="pb-2 font-medium">下载</th>
                <th className="pb-2 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F6F4FB]">
              {sources.map((source) => (
                <tr key={source.id}>
                  <td className="py-2.5 font-medium text-[#3F4058]">{source.name}</td>
                  <td className="py-2.5 text-[#8B8BA0]">{source.searchable ? '✓ 已支持' : '— 受限'}</td>
                  <td className="py-2.5 text-[#8B8BA0]">✓ 计划中</td>
                  <td className="py-2.5 text-[#8B8BA0]">✓ 计划中</td>
                  <td className="py-2.5 text-[#8B8BA0]">✓ 计划中</td>
                  <td className="py-2.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]',
                        source.state === 'online' ? 'bg-[#ECFDF5] text-[#0B9E74]' : 'bg-[#FEF6E7] text-[#B4791B]',
                      )}
                    >
                      {source.state === 'online' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
                      {stateMeta[source.state].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={Boolean(logSource)}
        onClose={() => setLogSource(null)}
        eyebrow="Diagnostics"
        title={`${logSource?.name ?? ''} · 诊断日志`}
        width="max-w-[620px]"
      >
        <div className="p-5">
          <div className="flex items-center justify-between pb-3">
            <p className="text-[10px] text-[#A2A2B6]">最近 5 条 · Mock 输出</p>
            <Badge tone="gray">只读</Badge>
          </div>
          <pre className="max-h-[320px] overflow-auto rounded-[12px] bg-[#1B1C3B] p-4 font-mono text-[10px] leading-[1.9] text-[#C9C6E8]">
            {[
              `[status] ${logSource?.id} state=${logSource?.state}`,
              `[probe] GET ${logSource?.host} -> 200 OK (${logSource?.latencyMs}ms)`,
              '[search] query="" -> skipped (no public keyword endpoint)',
              '[detail] adapter ready · rateLimit=1 req/s',
              '[warn] 真实网络请求未接入；以上数据来自前端 Mock',
            ].join('\n')}
          </pre>
          <p className="mt-3 text-[9.5px] leading-relaxed text-[#A2A2B6]">
            日志接口对应 GET /api/logs?limit=50，目前尚未实现，不应把 DSH 管理接口直接暴露到公网。
          </p>
        </div>
      </Modal>

      <div className="mt-5 flex items-center justify-between rounded-[12px] border border-[#EFEDF6] bg-white px-4 py-3 text-[10px] text-[#A2A2B6]">
        <span>源规则维护文档</span>
        <a
          href="https://github.com/xieqiong111/dsh-plugin-lightnovel"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[#6C4AD9] hover:underline"
        >
          GitHub 仓库
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

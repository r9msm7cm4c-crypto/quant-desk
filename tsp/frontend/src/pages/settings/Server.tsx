/**
 * 数据来源设置面板 —— 「本机模式」与「连接服务器」二选一。
 *
 * 之前的版本只讲怎么连 FastAPI，但真实用户常常没有电脑、没有服务器，
 * 那段说明对他是死路。现在的默认答案是「本机模式」：行情直连公开源、
 * 自选与偏好存本机 SQLite，开箱即用；填服务器只是进阶选项。
 */
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle2, Loader2, PlugZap, RotateCcw, Server, Smartphone, Wifi,
} from 'lucide-react'
import { toast } from '@/components/Toast'
import { getApiBase, isNativeShell, probeEndpoint, setApiBase, type ProbeResult } from '@/lib/endpoint'
import { describeLocalMode, getLocalModeSetting, setLocalModeSetting } from '@/core/local/mode'
import { cn } from '@/lib/cn'

const INPUT_CLS =
  'w-full h-9 px-2.5 rounded-lg bg-base border-0 ring-1 ring-border/30 text-xs font-mono text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow'

type ProbeState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'done'; result: ProbeResult }

export function SettingsServerPanel() {
  const qc = useQueryClient()
  const native = isNativeShell()
  const [saved, setSaved] = useState(() => getApiBase())
  const [draft, setDraft] = useState(() => getApiBase())
  const [probe, setProbe] = useState<ProbeState>({ kind: 'idle' })
  const [autoProbed, setAutoProbed] = useState(false)
  const [localMode, setLocalMode] = useState(() => describeLocalMode())

  const dirty = draft.trim() !== saved
  const localActive = localMode.active

  const runProbe = useCallback(async (target: string) => {
    setProbe({ kind: 'testing' })
    const result = await probeEndpoint(target)
    setProbe({ kind: 'done', result })
    return result
  }, [])

  useEffect(() => {
    if (autoProbed) return
    if (!saved) return
    setAutoProbed(true)
    void runProbe(saved)
  }, [autoProbed, runProbe, saved])

  const refreshMode = () => setLocalMode(describeLocalMode())

  const enableLocalMode = useCallback(async () => {
    // 本机模式与远端地址互斥：清掉地址，避免"以为在本地、实际在连一个不存在的服务器"
    setApiBase('')
    setLocalModeSetting('on')
    setSaved('')
    setDraft('')
    setProbe({ kind: 'idle' })
    refreshMode()
    await qc.invalidateQueries()
    toast('已切换为本机模式：行情直连公开源，无需服务器', 'success')
  }, [qc])

  const disableLocalMode = useCallback(async () => {
    setLocalModeSetting('off')
    refreshMode()
    await qc.invalidateQueries()
    toast('已关闭本机模式，请填写服务器地址后才会取数', 'success')
  }, [qc])

  const apply = useCallback(async () => {
    const next = setApiBase(draft)
    setSaved(next)
    setDraft(next)
    if (!next) {
      // 清空地址 = 回到本机模式（原生壳），不是"什么都没有"
      setLocalModeSetting('on')
      refreshMode()
      await qc.invalidateQueries()
      toast('已清空服务器地址，改用本机模式', 'success')
      return
    }
    setLocalModeSetting('off')
    refreshMode()
    await qc.invalidateQueries()
    toast(`已切换到 ${next}`, 'success')
    void runProbe(next)
  }, [draft, qc, runProbe])

  const state = probe.kind === 'done' ? probe.result : null

  return (
    <div className="space-y-6">
      {/* 本机模式（默认推荐） */}
      <section
        className={cn(
          'rounded-card border p-5 transition-colors',
          localActive ? 'border-accent/40 bg-accent/[0.06]' : 'border-border bg-surface',
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg ring-1',
              localActive ? 'bg-accent/15 ring-accent/30' : 'bg-base ring-border/40',
            )}
          >
            <Smartphone className={cn('h-4 w-4', localActive ? 'text-accent' : 'text-secondary')} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">本机模式</span>
              {localActive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  使用中
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-muted">{localMode.reason}</div>
          </div>
          <button
            type="button"
            onClick={() => void (localActive ? disableLocalMode() : enableLocalMode())}
            className={cn(
              'h-8 shrink-0 rounded-btn px-3 text-xs font-medium transition-colors',
              localActive
                ? 'border border-border bg-base text-secondary hover:text-foreground'
                : 'bg-accent text-base hover:opacity-90',
            )}
          >
            {localActive ? '关闭' : '开启'}
          </button>
        </div>

        <div className="mt-4 grid gap-2 text-[11px] leading-relaxed text-muted sm:grid-cols-2">
          <div className="rounded-lg bg-base px-3 py-2 ring-1 ring-border/30">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-accent">可用</div>
            自选与分组 · 实时行情 · 日线/分时 · 均线 MACD KDJ RSI BOLL · 指数 · 代码搜索
          </div>
          <div className="rounded-lg bg-base px-3 py-2 ring-1 ring-border/30">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-warning">需服务器</div>
            回测 · 选股策略 · AI 研报 · 扩展数据源 · 监控告警
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted/80">
          行情来自公开行情站的只读快照，不需要账号、不需要电脑，但需要网络。
          自选、偏好存在这台手机本地，卸载 App 会一并删除。
        </p>
      </section>

      {/* 服务器连接（进阶） */}
      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-base ring-1 ring-border/40">
            <Server className="h-4 w-4 text-secondary" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">服务器地址（可选）</div>
            <div className="truncate font-mono text-sm text-foreground">
              {saved || '未配置 · 使用本机模式'}
            </div>
          </div>
          {saved && <StatusPill probe={probe} />}
        </div>

        {state && (
          <div
            className={cn(
              'mt-4 rounded-lg px-3 py-2 text-xs leading-relaxed',
              state.ok
                ? 'bg-accent/10 text-accent ring-1 ring-accent/25'
                : 'bg-warning/10 text-warning ring-1 ring-warning/25',
            )}
          >
            {state.ok ? (
              <span>
                连接正常 · 延迟 {state.latencyMs} ms
                {state.version ? ` · 后端版本 ${state.version}` : ''}
                {state.mode ? ` · 数据模式 ${state.mode}` : ''}
              </span>
            ) : (
              <span>{state.error}</span>
            )}
          </div>
        )}

        <label className="mb-2 mt-4 block text-xs font-medium text-secondary">
          填写后走该服务器（可获得回测/选股等完整能力）
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void apply() }}
            placeholder="http://192.168.1.5:8000"
            className={cn(INPUT_CLS, 'min-w-[16rem] flex-1')}
          />
          <button
            type="button"
            onClick={() => void runProbe(draft)}
            disabled={probe.kind === 'testing' || !draft.trim()}
            className="h-9 shrink-0 rounded-btn border border-border bg-base px-3 text-xs text-secondary transition-colors hover:border-accent/40 hover:text-foreground disabled:opacity-50"
          >
            {probe.kind === 'testing' ? '测试中…' : '测试连接'}
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={!dirty}
            className="h-9 shrink-0 rounded-btn bg-accent px-3 text-xs font-medium text-base transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            保存并应用
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          只填主机与端口即可，协议可省略（自动补 <code className="font-mono">http://</code>）。
          留空并保存 = 回到本机模式。
        </p>

        {!native && getLocalModeSetting() === 'off' && (
          <button
            type="button"
            onClick={() => void enableLocalMode()}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            改回本机模式
          </button>
        )}
      </section>

      {/* 有服务器时的接线说明 */}
      <section className="rounded-card border border-border bg-surface p-5">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-secondary">
          <Wifi className="h-3.5 w-3.5" />
          只有在你确实有一台常开的机器时才需要看这里
        </h3>
        <ol className="space-y-2 text-[11px] leading-relaxed text-muted">
          <li>
            <span className="text-foreground">1.</span> 在跑后端的机器上启动服务，确认监听在 <code className="font-mono">0.0.0.0:8000</code>（不能只监听 127.0.0.1，否则手机连不上）。
          </li>
          <li>
            <span className="text-foreground">2.</span> 查这台机器的局域网 IP：macOS 用 <code className="font-mono">ipconfig getifaddr en0</code>，Windows 用 <code className="font-mono">ipconfig</code>，Linux 用 <code className="font-mono">hostname -I</code>。
          </li>
          <li>
            <span className="text-foreground">3.</span> 手机与它连同一个 Wi-Fi，填 <code className="font-mono">http://机器IP:8000</code>，点「测试连接」看到延迟再保存。
          </li>
        </ol>
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-base px-3 py-2 text-[11px] leading-relaxed text-muted ring-1 ring-border/30">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning/80" />
          <span>
            换网络（比如从家里 Wi-Fi 切到 4G）后局域网 IP 会失效，需要重新填。
            没有常开机器就别配这一栏，用上面的本机模式即可。
          </span>
        </div>
      </section>
    </div>
  )
}

function StatusPill({ probe }: { probe: ProbeState }) {
  if (probe.kind === 'testing') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-base px-2.5 py-1 text-[11px] text-muted ring-1 ring-border/40">
        <Loader2 className="h-3 w-3 animate-spin" />
        检测中
      </span>
    )
  }
  if (probe.kind !== 'done') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-base px-2.5 py-1 text-[11px] text-muted ring-1 ring-border/40">
        <PlugZap className="h-3 w-3" />
        未检测
      </span>
    )
  }
  return probe.result.ok ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] text-accent ring-1 ring-accent/25">
      <CheckCircle2 className="h-3 w-3" />
      已连接
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-[11px] text-warning ring-1 ring-warning/25">
      <AlertTriangle className="h-3 w-3" />
      未连通
    </span>
  )
}

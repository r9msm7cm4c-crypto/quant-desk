/**
 * 服务器连接设置面板 —— 配置后端（FastAPI）地址。
 *
 * 这个面板解决的是「App 装到手机上之后连不上服务」的根因：
 * 原生壳页面 origin 是 capacitor://localhost，相对路径 /api/* 打不到任何后端。
 * 让用户显式填写局域网/公网地址，全部请求与 SSE 改走绝对地址。
 */
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle2, Loader2, PlugZap, RotateCcw, Server, Wifi,
} from 'lucide-react'
import { toast } from '@/components/Toast'
import { getApiBase, isNativeShell, probeEndpoint, setApiBase, type ProbeResult } from '@/lib/endpoint'
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
  // 首次进入自动探活一次，避免用户对着一个不知道通不通的地址猜
  const [autoProbed, setAutoProbed] = useState(false)

  const dirty = draft.trim() !== saved

  const runProbe = useCallback(async (target: string) => {
    setProbe({ kind: 'testing' })
    const result = await probeEndpoint(target)
    setProbe({ kind: 'done', result })
    return result
  }, [])

  useEffect(() => {
    if (autoProbed) return
    if (!saved && native) return
    setAutoProbed(true)
    void runProbe(saved)
  }, [autoProbed, native, runProbe, saved])

  const apply = useCallback(async () => {
    const next = setApiBase(draft)
    setSaved(next)
    setDraft(next)
    if (native && !next) {
      toast('原生 App 必须填写后端地址，否则所有数据接口不可用', 'error')
      return
    }
    // 基址变了，所有缓存都属于旧服务器，整体作废重取
    await qc.invalidateQueries()
    toast(next ? `已切换到 ${next}` : '已恢复同源模式', 'success')
    void runProbe(next)
  }, [draft, native, qc, runProbe])

  const resetToSameOrigin = useCallback(async () => {
    setDraft('')
    setProbe({ kind: 'idle' })
    if (!native) {
      setApiBase('')
      setSaved('')
      await qc.invalidateQueries()
      toast('已恢复同源模式', 'success')
    }
  }, [native, qc])

  const state = probe.kind === 'done' ? probe.result : null

  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-muted">
        Quant Desk 的行情数据、指标计算与回测都在后端完成，App 需要知道后端在哪里。
        保存后所有请求与实时行情流会立即改连新地址，无需重启。
      </p>

      {/* 当前状态 */}
      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-base ring-1 ring-border/40">
            <Server className="h-4 w-4 text-secondary" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">当前生效地址</div>
            <div className="truncate font-mono text-sm text-foreground">
              {saved || (native ? '未配置' : '同源部署（当前页面所在服务）')}
            </div>
          </div>
          <StatusPill probe={probe} />
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
      </section>

      {/* 编辑区 */}
      <section className="rounded-card border border-border bg-surface p-5">
        <label className="mb-2 block text-xs font-medium text-secondary">后端地址</label>
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
            disabled={probe.kind === 'testing'}
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
          路径里的 <code className="font-mono">/api</code> 不需要写，填了会自动去掉。
        </p>

        {!native && (
          <button
            type="button"
            onClick={() => void resetToSameOrigin()}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            恢复同源模式（后端托管前端的部署方式）
          </button>
        )}
      </section>

      {/* 怎么拿到地址 */}
      <section className="rounded-card border border-border bg-surface p-5">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-secondary">
          <Wifi className="h-3.5 w-3.5" />
          怎么找到这个地址
        </h3>
        <ol className="space-y-2 text-[11px] leading-relaxed text-muted">
          <li>
            <span className="text-foreground">1.</span> 在跑后端的电脑上启动服务，确认监听在 <code className="font-mono">0.0.0.0:8000</code>（不能只监听 127.0.0.1，否则手机连不上）。
          </li>
          <li>
            <span className="text-foreground">2.</span> 查这台电脑的局域网 IP：macOS 用 <code className="font-mono">ipconfig getifaddr en0</code>，Windows 用 <code className="font-mono">ipconfig</code> 看「IPv4 地址」，Linux 用 <code className="font-mono">hostname -I</code>。
          </li>
          <li>
            <span className="text-foreground">3.</span> 手机与电脑连同一个 Wi-Fi，填 <code className="font-mono">http://电脑IP:8000</code>。
          </li>
          <li>
            <span className="text-foreground">4.</span> 点「测试连接」看到延迟，再「保存并应用」。保存后实时行情流会自动改连新地址，无需重启 App。
          </li>
        </ol>
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-base px-3 py-2 text-[11px] leading-relaxed text-muted ring-1 ring-border/30">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning/80" />
          <span>
            手机访问电脑属于内网访问，后端在未设访问密码时会放行内网请求；若已设密码，需要在 App 内登录。
            换网络（比如从家里 Wi-Fi 切到 4G）后 IP 会失效，需要重新填。
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

import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { CheckCircle2, CloudDownload, Info, Loader2, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react'
import {
  addOtaProgressListener,
  checkOtaUpdate,
  stageOtaUpdate,
  type OtaCheckResult,
  type OtaManifest,
} from '@/lib/otaUpdate'

type UiState = 'idle' | 'checking' | 'available' | 'latest' | 'downloading' | 'staged' | 'error' | 'unsupported' | 'unconfigured' | 'disabled' | 'incompatible'

export function SettingsOtaUpdatePanel() {
  const [state, setState] = useState<UiState>(Capacitor.isNativePlatform() ? 'idle' : 'unsupported')
  const [message, setMessage] = useState(Capacitor.isNativePlatform()
    ? '检查是否有可直接安装的应用内容更新。'
    : '此功能仅在安装后的 iOS / Android App 中可用。')
  const [manifest, setManifest] = useState<OtaManifest | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let dispose: (() => void) | undefined
    let mounted = true
    void addOtaProgressListener(value => { if (mounted) setProgress(value) })
      .then(remove => { if (mounted) dispose = remove; else remove() })
      .catch(() => undefined)
    return () => { mounted = false; dispose?.() }
  }, [])

  const check = useCallback(async () => {
    setState('checking')
    setMessage('正在检查更新清单…')
    setManifest(null)
    try {
      const result: OtaCheckResult = await checkOtaUpdate()
      setMessage(result.message)
      if ('manifest' in result && result.manifest) setManifest(result.manifest)
      setState(result.status === 'available' ? 'available' : result.status)
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : '检查更新失败，请稍后重试。')
    }
  }, [])

  const download = useCallback(async () => {
    if (!manifest) return
    setState('downloading')
    setProgress(0)
    setMessage('正在下载并验证更新包…')
    try {
      await stageOtaUpdate(manifest)
      setState('staged')
      setMessage(`v${manifest.version} 已完成签名与完整性验证，并已暂存。完全退出后重新打开 Quant Desk 即可应用更新。`)
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : '下载或验证失败，当前版本保持不变。')
    }
  }, [manifest])

  const busy = state === 'checking' || state === 'downloading'
  const isNative = Capacitor.isNativePlatform()

  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CloudDownload className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-foreground">应用内内容更新</h3>
        </div>
        <span className="rounded-full border border-border bg-elevated px-2 py-0.5 text-[10px] text-secondary">OTA</span>
      </div>
      <p className="text-xs leading-relaxed text-secondary">在应用内检查、下载和验证兼容的前端内容包，不需要每次重新安装 IPA。更新会先暂存，重新打开应用后生效。</p>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-elevated/50 p-3">
        {state === 'latest' || state === 'staged'
          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          : state === 'unconfigured' || state === 'incompatible'
            ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
        <p className="min-w-0 text-xs leading-relaxed text-secondary" role="status" aria-live="polite">{message}</p>
      </div>

      {state === 'downloading' && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-muted"><span>下载进度</span><span>{Math.round(progress * 100)}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-elevated"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        </div>
      )}

      {manifest && state === 'available' && (
        <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">新内容 v{manifest.version}</span>
            <span className="text-[10px] text-muted">{new Date(manifest.publishedAt).toLocaleDateString()}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-secondary">{manifest.releaseNotes}</p>
          <button onClick={() => void download()} disabled={busy} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-btn bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50">
            <CloudDownload className="h-3.5 w-3.5" />下载并验证更新
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted"><Smartphone className="h-3.5 w-3.5" />{isNative ? '原生 App 更新通道' : 'Web 预览不支持 OTA'}</div>
        <button onClick={() => void check()} disabled={!isNative || busy || state === 'staged'} className="inline-flex min-h-9 items-center gap-2 rounded-btn bg-elevated px-3 py-2 text-xs text-secondary transition-colors hover:text-foreground disabled:opacity-50">
          {state === 'checking' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {state === 'checking' ? '检查中…' : '检查内容更新'}
        </button>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted">仅接受 HTTPS GitHub Release 更新包，并校验 SHA-256 与 RSA 数字签名。原生插件、权限、系统能力或运行时变更仍需重新构建 IPA。</p>
    </section>
  )
}

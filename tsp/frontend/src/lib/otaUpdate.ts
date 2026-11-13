import { Capacitor } from '@capacitor/core'
import { LiveUpdate } from '@capawesome/capacitor-live-update'

export const OTA_RUNTIME_VERSION = 'qd-cap8-v1'
export const OTA_BUNDLED_VERSION = import.meta.env.VITE_OTA_BUNDLED_VERSION || '0.1.0'
export const OTA_MANIFEST_URL = import.meta.env.VITE_OTA_MANIFEST_URL
  || 'https://raw.githubusercontent.com/r9msm7cm4c-crypto/quant-desk/main/ota/stable.json'

export type OtaManifest = {
  schemaVersion: 1
  enabled: boolean
  appId: 'com.quantdesk.mobile'
  channel: 'stable' | 'beta'
  runtimeVersion: string
  version: string
  bundleId: string
  minAppVersion: string
  bundleUrl: string
  sha256: string
  signature: string
  publishedAt: string
  releaseNotes: string
}

export type OtaCheckResult =
  | { status: 'unsupported' | 'unconfigured' | 'disabled' | 'latest'; message: string; manifest?: OtaManifest }
  | { status: 'available'; message: string; manifest: OtaManifest; currentVersion: string; currentBundleId: string | null }
  | { status: 'incompatible'; message: string; manifest: OtaManifest }

const APP_ID = 'com.quantdesk.mobile'
const OTA_PUBLIC_KEY_CONFIGURED = import.meta.env.VITE_OTA_PUBLIC_KEY_CONFIGURED === 'true'
const MANIFEST_TIMEOUT_MS = 12_000
const BUNDLE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,100}$/
const SHA256_RE = /^[a-f0-9]{64}$/i
const SIGNATURE_RE = /^[A-Za-z0-9+/]+={0,2}$/
const ALLOWED_BUNDLE_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])

function parseVersion(value: string): number[] | null {
  const match = value.trim().replace(/^v/i, '').match(/^(\d+(?:\.\d+){0,3})(?:[-+].*)?$/)
  if (!match) return null
  return match[1].split('.').map(part => Number(part))
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0)
    if (delta !== 0) return delta > 0 ? 1 : -1
  }
  return 0
}

export function validateManifest(input: unknown): OtaManifest {
  if (!input || typeof input !== 'object') throw new Error('更新清单格式无效')
  const m = input as Record<string, unknown>
  if (m.schemaVersion !== 1) throw new Error('不支持的更新清单版本')
  if (m.enabled !== true && m.enabled !== false) throw new Error('更新清单缺少 enabled 状态')
  if (m.appId !== APP_ID) throw new Error('更新包不属于当前应用')
  if (m.channel !== 'stable' && m.channel !== 'beta') throw new Error('更新通道无效')
  if (typeof m.runtimeVersion !== 'string' || !m.runtimeVersion.trim()) throw new Error('缺少原生运行时兼容标识')
  if (typeof m.version !== 'string' || !parseVersion(m.version)) throw new Error('更新版本号无效')
  if (typeof m.bundleId !== 'string' || !BUNDLE_ID_RE.test(m.bundleId) || m.bundleId === 'public') throw new Error('更新包 ID 无效')
  if (typeof m.minAppVersion !== 'string' || !parseVersion(m.minAppVersion)) throw new Error('最低 App 版本无效')
  if (typeof m.bundleUrl !== 'string') throw new Error('缺少更新包地址')
  const bundleUrl = new URL(m.bundleUrl)
  if (bundleUrl.protocol !== 'https:' || !ALLOWED_BUNDLE_HOSTS.has(bundleUrl.hostname)) {
    throw new Error('更新包必须来自受信任的 HTTPS GitHub Release 地址')
  }
  if (typeof m.sha256 !== 'string' || !SHA256_RE.test(m.sha256)) throw new Error('SHA-256 校验值无效')
  if (typeof m.signature !== 'string' || !SIGNATURE_RE.test(m.signature)) throw new Error('数字签名格式无效')
  if (typeof m.publishedAt !== 'string' || Number.isNaN(Date.parse(m.publishedAt))) throw new Error('发布时间无效')
  if (typeof m.releaseNotes !== 'string' || m.releaseNotes.length > 4000) throw new Error('更新说明无效')

  return {
    schemaVersion: 1,
    enabled: m.enabled as boolean,
    appId: APP_ID,
    channel: m.channel,
    runtimeVersion: m.runtimeVersion,
    version: m.version,
    bundleId: m.bundleId,
    minAppVersion: m.minAppVersion,
    bundleUrl: bundleUrl.toString(),
    sha256: m.sha256,
    signature: m.signature,
    publishedAt: m.publishedAt,
    releaseNotes: m.releaseNotes,
  }
}

async function getNativeConfiguration(): Promise<{ configured: boolean; versionName: string }> {
  const version = await LiveUpdate.getVersionName()
  // The plugin intentionally does not expose its public key through the runtime API.
  // This build-time flag is set only when the matching PEM public key is injected
  // into capacitor.config.ts during the native build.
  return { configured: OTA_PUBLIC_KEY_CONFIGURED, versionName: version.versionName }
}

export async function checkOtaUpdate(): Promise<OtaCheckResult> {
  if (!Capacitor.isNativePlatform()) {
    return { status: 'unsupported', message: '应用内更新仅在已安装的 iOS / Android App 中可用。' }
  }

  const native = await getNativeConfiguration()
  if (!native.configured) {
    return { status: 'unconfigured', message: '尚未配置 OTA 公钥。请先完成更新签名密钥初始化并重新构建 IPA。' }
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS)
  try {
    const separator = OTA_MANIFEST_URL.includes('?') ? '&' : '?'
    const response = await fetch(`${OTA_MANIFEST_URL}${separator}_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`更新清单请求失败（HTTP ${response.status}）`)
    const manifest = validateManifest(await response.json())
    if (!manifest.enabled) return { status: 'disabled', message: '更新通道已配置，但暂时没有发布新内容。', manifest }
    if (manifest.runtimeVersion !== OTA_RUNTIME_VERSION) {
      return { status: 'incompatible', message: '此更新需要新的原生运行时，请先安装新版 IPA。', manifest }
    }
    if (compareVersions(native.versionName, manifest.minAppVersion) < 0) {
      return { status: 'incompatible', message: `此更新要求 App 至少为 ${manifest.minAppVersion}，当前为 ${native.versionName}。`, manifest }
    }
    const current = await LiveUpdate.getCurrentBundle()
    const currentContentVersion = current.bundleId?.startsWith('qd-web-')
      ? current.bundleId.slice('qd-web-'.length)
      : OTA_BUNDLED_VERSION
    // Prevent a stale or replayed manifest from downgrading the installed web bundle.
    if (current.bundleId === manifest.bundleId || compareVersions(manifest.version, currentContentVersion) <= 0) {
      return { status: 'latest', message: `当前内容版本为 v${currentContentVersion}，没有更新版本可安装。`, manifest }
    }
    return {
      status: 'available',
      message: `发现内容更新 v${manifest.version}`,
      manifest,
      currentVersion: native.versionName,
      currentBundleId: current.bundleId ?? null,
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function stageOtaUpdate(manifest: OtaManifest): Promise<void> {
  if (!Capacitor.isNativePlatform()) throw new Error('当前平台不支持应用内更新')
  const native = await getNativeConfiguration()
  if (!native.configured) throw new Error('缺少 OTA 公钥，已阻止下载')
  if (manifest.runtimeVersion !== OTA_RUNTIME_VERSION) throw new Error('原生运行时不兼容，已阻止安装')

  await LiveUpdate.downloadBundle({
    url: manifest.bundleUrl,
    bundleId: manifest.bundleId,
    checksum: manifest.sha256,
    signature: manifest.signature,
  })
  await LiveUpdate.setNextBundle({ bundleId: manifest.bundleId })
}

let readyPromise: Promise<void> | null = null

export function markOtaAppReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve()
  if (!readyPromise) {
    readyPromise = LiveUpdate.ready().then(() => undefined).catch((error) => {
      // OTA readiness must never prevent the bundled app from starting.
      console.warn('[Quant Desk OTA] ready() failed:', error)
    })
  }
  return readyPromise
}

export async function addOtaProgressListener(
  callback: (progress: number) => void,
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => undefined
  const listener = await LiveUpdate.addListener('downloadBundleProgress', event => {
    callback(Math.max(0, Math.min(1, event.progress)))
  })
  return () => { void listener.remove() }
}

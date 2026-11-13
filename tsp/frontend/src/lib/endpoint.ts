/**
 * 后端服务地址（Endpoint）管理 —— 全项目唯一的 API 基址来源。
 *
 * 背景：`api.ts` 原本写死 `const BASE = ''`，所有请求走同源相对路径 `/api/...`。
 * 这在「FastAPI 托管前端 dist」的部署下成立，但装进 Capacitor 原生壳后，
 * 页面 origin 变成 `capacitor://localhost`，相对路径会打到 WebView 本地服务器，
 * 拿到的是 index.html（200 + text/html），于是：
 *   - 所有 JSON 请求解析失败
 *   - EventSource('/api/intraday/stream') 握手失败 → 无限重连
 *   - 界面长期显示「与服务连接已断开 · 正在重连」
 *
 * 修复思路：把基址变成用户可配置、可持久化的值。
 *   - Web 同源部署：留空 → 走相对路径，行为与改造前完全一致
 *   - 原生壳 / 跨机访问：填 `http://192.168.1.5:8000` → 全部请求改走绝对地址
 */

import { Capacitor } from '@capacitor/core'
import { tryLocalResponse } from '@/core/local/bridge'

const STORAGE_KEY = 'qd:endpoint:base'

/** 原生壳（iOS/Android）内没有可用的同源后端。 */
export function isNativeShell(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** 原生壳里地址必填；Web 端可留空表示同源。 */
export class EndpointNotConfiguredError extends Error {
  readonly code = 'ENDPOINT_NOT_CONFIGURED'
  constructor() {
    super('尚未配置后端服务地址，请在「设置 → 服务器连接」中填写')
    this.name = 'EndpointNotConfiguredError'
  }
}

/**
 * 规范化用户输入：
 * - 去空白、去尾部斜杠
 * - 只有主机端口时补 `http://`（用户很少会手打协议）
 * - 误粘贴的 `/api` 后缀去掉（真实基址不含 /api，路径里自带）
 * - 反斜杠纠正（从聊天/文档复制常见）
 */
export function normalizeApiBase(raw: string): string {
  let s = String(raw ?? '').trim().replace(/\\/g, '/')
  if (!s) return ''
  // 去协议外的一切前后缀空白与引号
  s = s.replace(/^["'<\s]+|["'>\s]+$/g, '')
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    // 纯主机/端口/IP，或 host/path
    s = `http://${s.replace(/^\/+/, '')}`
  }
  s = s.replace(/\/+$/, '')
  s = s.replace(/\/api$/i, '')
  s = s.replace(/\/+$/, '')
  // 只允许 http / https，避免 javascript: 之类被写进来
  if (!/^https?:\/\//i.test(s)) return ''
  try {
    // 用 URL 做一次结构校验（非法 host 会抛）
    const u = new URL(s)
    if (!u.hostname) return ''
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return ''
  }
}

let _cached: string | null = null
const _listeners = new Set<() => void>()

function _read(): string {
  try {
    return normalizeApiBase(localStorage.getItem(STORAGE_KEY) || '')
  } catch {
    return ''
  }
}

/** 当前基址。空字符串 = 同源（仅 Web 部署有效）。 */
export function getApiBase(): string {
  if (_cached === null) _cached = _read()
  return _cached
}

export function setApiBase(raw: string): string {
  const next = normalizeApiBase(raw)
  _cached = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 隐私模式写不进去时，本次会话内仍然生效 */
  }
  _listeners.forEach((fn) => fn())
  return next
}

export function subscribeApiBase(fn: () => void): () => void {
  _listeners.add(fn)
  return () => {
    _listeners.delete(fn)
  }
}

/** 是否为「显式配置过远端地址」（而非依赖同源）。 */
export function hasExplicitEndpoint(): boolean {
  return getApiBase() !== ''
}

/**
 * 把 `/api/xxx` 解析成可直接 fetch 的地址。
 * 原生壳 + 未配置 → 抛 EndpointNotConfiguredError，让调用方快速失败，
 * 而不是打到本地服务器拿回一张 HTML 再在 JSON.parse 处报莫名其妙的错。
 */
export function resolveApiUrl(path: string): string {
  // 已经是绝对地址（少数调用方直接传完整 URL）→ 原样使用，不再拼接基址
  if (/^https?:\/\//i.test(path)) return path
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getApiBase()
  if (base) return `${base}${p}`
  if (isNativeShell()) throw new EndpointNotConfiguredError()
  return p
}

/** 同 resolveApiUrl，但不抛错；用于不想中断流程的场景（如日志/埋点）。 */
export function tryResolveApiUrl(path: string): string {
  try {
    return resolveApiUrl(path)
  } catch {
    return path.startsWith('/') ? path : `/${path}`
  }
}

/**
 * 内置 fetch 的等价物，自动套用当前基址。
 * 供绕过 api.ts 的少数调用点（扩展运行时、任务登记、偏好同步等）使用，
 * 避免这些请求在原生壳里继续打到 capacitor://localhost。
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // 本机模式：/api/* 由设备内应答，换成标准 Response 交回调用方
  return tryLocalResponse(path, init).then((local) => local ?? fetch(tryResolveApiUrl(path), init))
}

/** 界面展示用：当前实际目标。 */
export function describeApiTarget(): string {
  const base = getApiBase()
  if (base) return base
  return isNativeShell() ? '未配置' : '同源部署'
}

/** 探测结果 */
export type ProbeResult = {
  ok: boolean
  latencyMs: number
  version?: string
  mode?: string
  /** 面向用户的错误描述 */
  error?: string
  /** 原始 HTTP 状态（有响应时） */
  status?: number
}

/**
 * 探活：请求 `GET {base}/health`。
 * 后端 `app/api/routes.py` 的 `/health` 在白名单内，未设访问密码也能调，
 * 返回 `{status:'ok', version, mode, memory}`。
 */
export async function probeEndpoint(rawBase: string, timeoutMs = 6000): Promise<ProbeResult> {
  const base = normalizeApiBase(rawBase)
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)

  if (!base && isNativeShell()) {
    return { ok: false, latencyMs: 0, error: '请先填写地址，例如 http://192.168.1.5:8000' }
  }

  const ctl = new AbortController()
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctl.signal,
      // 探活不走缓存，避免把上一次结果当成本次结论
      cache: 'no-store',
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, latencyMs: elapsed(), status: res.status, error: `服务返回 HTTP ${res.status}` }
    }
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      return {
        ok: false,
        latencyMs: elapsed(),
        status: res.status,
        error: '返回的不是接口数据（可能是网页或代理错误页），请检查地址与端口',
      }
    }
    if (json?.status !== 'ok') {
      return { ok: false, latencyMs: elapsed(), status: res.status, error: '服务有响应但未报告就绪' }
    }
    return {
      ok: true,
      latencyMs: elapsed(),
      status: res.status,
      version: typeof json.version === 'string' ? json.version : undefined,
      mode: typeof json.mode === 'string' ? json.mode : undefined,
    }
  } catch (e: any) {
    const aborted = e?.name === 'AbortError'
    return {
      ok: false,
      latencyMs: elapsed(),
      error: aborted
        ? `连接超时（${Math.round(timeoutMs / 1000)}s），请确认手机与服务器在同一网络、端口已放行`
        : '连接失败：地址不可达，或被系统网络策略拦截（HTTP 明文需允许本地网络）',
    }
  } finally {
    window.clearTimeout(timer)
  }
}

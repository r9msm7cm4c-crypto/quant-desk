/**
 * 本地行情引擎的 HTTP 层。
 *
 * 为什么不能直接用 fetch：
 *   iOS 上页面 origin 是 `capacitor://localhost`，行情源（qt.gtimg.cn / 新浪）
 *   不返回 CORS 头，WebView 的 fetch 会在预检阶段被拦掉。CapacitorHttp 走的是
 *   原生 URLSession，不受同源策略约束，也不需要服务端配合。
 *
 * 编码：腾讯 `qt.gtimg.cn` 返回 GBK（不声明 charset 时按 UTF-8 解会全变问号），
 * 所以统一按字节取回后自己解码，避免中文字段（股票名）损坏。
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core'

export class LocalNetworkError extends Error {
  readonly code = 'LOCAL_NETWORK'
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'LocalNetworkError'
  }
}

export interface HttpTextOptions {
  /** 毫秒，默认 12s。行情源在弱网下经常 3-5s，给足余量但别拖死界面 */
  timeoutMs?: number
  headers?: Record<string, string>
  /** 文本编码，腾讯行情需要 gbk */
  encoding?: 'utf-8' | 'gbk'
  /** 是否允许使用上一次成功结果（离线兜底）。默认 true */
  allowStale?: boolean
}

interface CacheEntry {
  text: string
  at: number
  ttlMs: number
}

const DEFAULT_TIMEOUT_MS = 12_000
/** 命中缓存的默认新鲜期：实时报价 3s，历史 K 线由调用方传更长 TTL */
export const QUOTE_TTL_MS = 3_000
export const KLINE_TTL_MS = 30 * 60_000

const _cache = new Map<string, CacheEntry>()
const _inflight = new Map<string, Promise<string>>()

function cacheKey(url: string, encoding: string) {
  return `${encoding}|${url}`
}

/** 取缓存（允许过期）；用于网络失败时的兜底展示。 */
export function peekCached(url: string, encoding: 'utf-8' | 'gbk' = 'utf-8'): string | null {
  return _cache.get(cacheKey(url, encoding))?.text ?? null
}

export function clearHttpCache(): void {
  _cache.clear()
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function decodeText(bytes: Uint8Array, encoding: 'utf-8' | 'gbk'): string {
  if (encoding === 'utf-8') return new TextDecoder('utf-8').decode(bytes)
  // gb18030 是 gbk 的超集，覆盖生僻字；WKWebView 与 Chrome 均内置该解码器
  try {
    return new TextDecoder('gb18030').decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

async function nativeGetBytes(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  encoding: 'utf-8' | 'gbk',
): Promise<string> {
  const res = await CapacitorHttp.request({
    url,
    method: 'GET',
    headers,
    responseType: 'arraybuffer',
    connectTimeout: timeoutMs,
    readTimeout: timeoutMs,
  })
  const status = Number(res.status ?? 0)
  if (status < 200 || status >= 300) {
    throw new LocalNetworkError(`行情源返回 HTTP ${status}`, status)
  }
  const raw = res.data
  if (typeof raw !== 'string' || raw.length === 0) throw new LocalNetworkError('行情源返回空响应', status)
  // arraybuffer 模式下 Capacitor 返回 base64 字符串
  return decodeText(decodeBase64ToBytes(raw), encoding)
}

async function webGetBytes(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  encoding: 'utf-8' | 'gbk',
): Promise<string> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers, signal: ctl.signal, cache: 'no-store' })
    if (!res.ok) throw new LocalNetworkError(`行情源返回 HTTP ${res.status}`, res.status)
    const buf = new Uint8Array(await res.arrayBuffer())
    return decodeText(buf, encoding)
  } catch (e: any) {
    if (e instanceof LocalNetworkError) throw e
    if (e?.name === 'AbortError') throw new LocalNetworkError('行情源请求超时')
    throw new LocalNetworkError('行情源不可达（Web 端直连被跨域拦截，属预期；iOS 原生壳走原生通道）')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET 文本，带内存缓存 + 并发合并 + 失败回退旧缓存。
 * 同一 URL 在 TTL 内的重复请求不会真的发出去 —— 自选页 50 只票每秒刷新会打爆源站。
 */
export async function httpGetText(url: string, options: HttpTextOptions = {}): Promise<string> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, encoding = 'utf-8', allowStale = true } = options
  const key = cacheKey(url, encoding)
  const now = Date.now()

  const hit = _cache.get(key)
  if (hit && now - hit.at < hit.ttlMs) return hit.text

  const running = _inflight.get(key)
  if (running) return running

  const reqHeaders: Record<string, string> = {
    Accept: '*/*',
    // 部分源站按 UA 分流；用桌面 UA 拿到的字段最全
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    ...headers,
  }

  const task = (async () => {
    try {
      const text = isNative()
        ? await nativeGetBytes(url, reqHeaders, timeoutMs, encoding)
        : await webGetBytes(url, reqHeaders, timeoutMs, encoding)
      if (!text) throw new LocalNetworkError('行情源返回空响应')
      _cache.set(key, { text, at: Date.now(), ttlMs: QUOTE_TTL_MS })
      return text
    } catch (e) {
      if (allowStale && hit) return hit.text
      throw e
    } finally {
      _inflight.delete(key)
    }
  })()

  _inflight.set(key, task)
  return task
}

/** 覆盖某 URL 的缓存新鲜期（历史 K 线用长 TTL，避免每次翻页都重下 300 根）。 */
export function setCacheTtl(url: string, ttlMs: number, encoding: 'utf-8' | 'gbk' = 'utf-8'): void {
  const entry = _cache.get(cacheKey(url, encoding))
  if (entry) entry.ttlMs = ttlMs
}

/** JSON GET，解析失败给出可读错误（源站偶尔返回 HTML 风控页）。 */
export async function httpGetJson<T>(url: string, options: HttpTextOptions = {}): Promise<T> {
  const text = await httpGetText(url, options)
  try {
    return JSON.parse(text) as T
  } catch {
    // 新浪 K 线接口返回的是非严格 JSON（键无引号）时的兜底
    const relaxed = text.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    try {
      return JSON.parse(relaxed) as T
    } catch {
      throw new LocalNetworkError('行情源返回了非 JSON 内容（可能被风控页面拦截）')
    }
  }
}

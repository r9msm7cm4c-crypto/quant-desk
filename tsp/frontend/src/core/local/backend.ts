/**
 * 本地后端（Local Backend）—— 在设备内实现 `/api/*` 的一个子集。
 *
 * 存在理由：用户手上只有一台 iPhone，没有电脑、没有服务器、也没有常开的后端。
 * 之前那版把「连不上后端」当成配置问题去修提示文案，方向错了——
 * 真正要解决的是「没有后端也必须能用」。
 *
 * 定位：这是 api.ts 的 Adapter 层，不是第二个后端。
 *   - 页面代码零改动：请求还是在 lib/api.ts 里发出，只是未配置远端时改由本模块应答
 *   - 已实现：自选/分组（SQLite）、实时行情、日线/分时、指标与信号、搜索、指数
 *   - 未实现：策略回测、选股、AI 研报、扩展数据、监控告警等重计算功能
 *     一律返回 501 + 可读原因，由界面显示「本地模式暂不支持」，绝不静默返回空数组
 *     —— 空数组会让用户以为「今天没有符合条件的票」，比报错更危险。
 */

import { buildEnriched, seriesOf, toKlineRows, clearSeriesCache } from './enrich'
import { fetchMinuteBars, fetchQuotes, searchInstruments } from './sources'
import { assetTypeOf, normalizeSymbol, parseSymbol } from './symbol'
import {
  allPreferences,
  getPreference,
  setPreference,
  addGroupMember,
  addWatchlist,
  addWatchlistBatch,
  clearGroup,
  clearWatchlist,
  createGroup,
  deleteGroup,
  listGroups,
  listWatchlist,
  lookupNames,
  moveWatchlistToTop,
  rememberInstrumentNames,
  removeGroupMember,
  removeWatchlist,
  renameGroup,
  reorderGroups,
  seedDefaultWatchlist,
  setWatchlistGroups,
} from './store'

/**
 * 本地层的错误类型。刻意不 import lib/api 的 ApiError：
 * api.ts 要 import 本模块，互相 import 会形成 ESM 循环，
 * 类在模块初始化期被引用会拿到 undefined。由 api.ts 在边界处包一层。
 */
export class LocalApiError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message)
    this.name = 'LocalApiError'
  }
}

/** 本地实现不了的端点，统一用这个错误类型带出可读原因。 */
class LocalUnsupportedError extends Error {
  readonly status = 501
  constructor(readonly feature: string) {
    super(`本地模式暂不支持「${feature}」：该功能依赖后端计算（回测/选股/AI/扩展数据），手机端暂无法离线完成`)
    this.name = 'LocalUnsupportedError'
  }
}

function asNumber(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

interface Ctx {
  method: string
  pathname: string
  query: URLSearchParams
  body: any
  params: Record<string, string>
}

function parseBody(raw: BodyInit | null | undefined): any {
  if (raw == null) return null
  if (typeof raw !== 'string') return null
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ===== 行情辅助 =====

async function quoteRows(symbols: string[]) {
  const map = await fetchQuotes(symbols)
  return symbols
    .map((s) => map.get(normalizeSymbol(s)))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => ({
      symbol: q.symbol,
      price: q.price,
      pct: q.changePct,
      change_pct: q.changePct,
      close: q.price,
      prev_close: q.prevClose,
      open: q.open,
      high: q.high,
      low: q.low,
      volume: q.volume,
      amount: q.amount,
      turnover_rate: q.turnoverRate,
      vol_ratio_5d: q.volRatio,
      name: q.name,
    }))
}

// ===== 路由 =====

type Handler = (ctx: Ctx) => Promise<any>

const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = []

function route(method: string, pattern: string, handler: Handler) {
  const keys: string[] = []
  const source = pattern.replace(/:([A-Za-z_]+)/g, (_, k) => {
    keys.push(k)
    return '([^/]+)'
  })
  routes.push({ method, pattern: new RegExp(`^${source}$`), keys, handler })
}

// ---- 自选 ----

route('GET', '/api/watchlist', async () => {
  await seedDefaultWatchlist()
  return { symbols: await listWatchlist() }
})

route('POST', '/api/watchlist', async ({ body }) => {
  const symbol = String(body?.symbol ?? '').trim()
  if (!symbol) throw new LocalApiError('缺少 symbol', 422)
  return { symbols: await addWatchlist(symbol, String(body?.note ?? ''), body?.group_id ?? null) }
})

route('POST', '/api/watchlist/batch', async ({ body }) => {
  const list: string[] = Array.isArray(body?.symbols) ? body.symbols : []
  if (list.length === 0) return { symbols: await listWatchlist(), added: 0 }
  return addWatchlistBatch(list.map(String), String(body?.note ?? ''), body?.group_id ?? null, body?.group_ids ?? null)
})

route('DELETE', '/api/watchlist', async () => clearWatchlist())

route('POST', '/api/watchlist/import-codes', async ({ body }) => {
  const text = String(body?.text ?? '')
  const codes = Array.from(new Set((text.match(/\d{6}/g) ?? []).map((c) => c)))
  const candidates = codes.map((code) => {
    const parsed = parseSymbol(code)
    return {
      code,
      symbol: parsed?.symbol ?? null,
      name: null,
      matched: !!parsed,
      already_in_watchlist: false,
    }
  })
  return {
    provider: 'local',
    codes,
    candidates,
    matched_count: candidates.filter((c) => c.matched).length,
    unmatched_count: candidates.filter((c) => !c.matched).length,
  }
})

route('GET', '/api/watchlist/enriched', async () => buildEnriched())

route('GET', '/api/watchlist/quotes', async () => {
  const entries = await listWatchlist()
  return { quotes: await quoteRows(entries.map((e) => e.symbol)) }
})

route('GET', '/api/watchlist/groups', async () => listGroups())

route('POST', '/api/watchlist/groups', async ({ body }) => {
  const name = String(body?.name ?? '').trim()
  if (!name) throw new LocalApiError('分组名不能为空', 422)
  return createGroup(name, String(body?.color ?? 'sky'))
})

// 注意：/reorder 必须在 /:id 之前注册，否则会被当成 id='reorder'
route('PUT', '/api/watchlist/groups/reorder', async ({ body }) => {
  const ids: string[] = Array.isArray(body?.ordered_ids) ? body.ordered_ids : []
  return reorderGroups(ids.map(String))
})

route('PUT', '/api/watchlist/groups/:id', async ({ body, params }) => {
  return renameGroup(params.id, String(body?.name ?? ''), String(body?.color ?? 'sky'))
})

route('DELETE', '/api/watchlist/groups/:id', async ({ params }) => deleteGroup(params.id))

route('POST', '/api/watchlist/groups/:id/clear', async ({ params }) => clearGroup(params.id))

route('POST', '/api/watchlist/groups/:id/members/:symbol', async ({ params }) => ({
  symbols: await addGroupMember(params.id, params.symbol),
}))

route('DELETE', '/api/watchlist/groups/:id/members/:symbol', async ({ params }) => ({
  symbols: await removeGroupMember(params.id, params.symbol),
}))

route('PUT', '/api/watchlist/:symbol/group', async ({ params, body }) => {
  const gid = body?.group_id
  return { symbols: await setWatchlistGroups(params.symbol, gid ? [String(gid)] : []) }
})

route('POST', '/api/watchlist/:symbol/top', async ({ params }) => ({
  symbols: await moveWatchlistToTop(params.symbol),
}))

route('DELETE', '/api/watchlist/:symbol', async ({ params }) => ({ symbols: await removeWatchlist(params.symbol) }))

// ---- K 线 ----

route('GET', '/api/kline/daily', async ({ query }) => {
  const symbol = normalizeSymbol(query.get('symbol') ?? '')
  if (!symbol) throw new LocalApiError('缺少 symbol', 422)
  const days = asNumber(query.get('days'), 120)
  const series = await seriesOf(symbol)
  let rows = toKlineRows(series, symbol)
  // 日期区间优先于天数（前端翻历史时用 start_date/end_date）
  const start = query.get('start_date')
  const end = query.get('end_date')
  if (start && end) rows = rows.filter((r) => r.date >= start && r.date <= end)
  else if (days > 0) rows = rows.slice(-Math.round(days))
  return { symbol, name: undefined, rows, source: 'local' }
})

route('GET', '/api/kline/daily/latest', async ({ query }) => {
  const symbol = normalizeSymbol(query.get('symbol') ?? '')
  const series = await seriesOf(symbol)
  const rows = toKlineRows(series, symbol)
  const last = rows[rows.length - 1] ?? null
  return { symbol, row: last, source: last ? 'live' : 'none' }
})

route('POST', '/api/kline/daily-batch', async ({ body }) => {
  const symbols: string[] = Array.isArray(body?.symbols) ? body.symbols.map(String) : []
  const days = asNumber(body?.days, 12)
  const data: Record<string, any[]> = {}
  let cursor = 0
  const worker = async () => {
    while (cursor < symbols.length) {
      const sym = normalizeSymbol(symbols[cursor++])
      try {
        const series = await seriesOf(sym)
        const rows = toKlineRows(series, sym)
        data[sym] = days > 0 ? rows.slice(-Math.round(days)) : rows
      } catch {
        data[sym] = []
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, symbols.length) }, worker))
  return { data }
})

route('GET', '/api/kline/minute', async ({ query }) => {
  const symbol = normalizeSymbol(query.get('symbol') ?? '')
  if (!symbol) throw new LocalApiError('缺少 symbol', 422)
  const { date, prevClose, bars } = await fetchMinuteBars(symbol)
  const requested = query.get('date')
  if (requested && date && requested !== date) {
    return { symbol, date: requested, rows: [], source: 'none', prev_close: null }
  }
  return {
    symbol,
    date,
    rows: bars.map((b) => ({
      datetime: b.datetime,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      amount: b.amount,
    })),
    source: bars.length ? 'live' : 'none',
    prev_close: prevClose,
    asset_type: assetTypeOf(symbol),
  }
})

route('POST', '/api/kline/minute-batch', async ({ body }) => {
  const symbols: string[] = Array.isArray(body?.symbols) ? body.symbols.map(String) : []
  const data: Record<string, any[]> = {}
  let cursor = 0
  const worker = async () => {
    while (cursor < symbols.length) {
      const sym = normalizeSymbol(symbols[cursor++])
      try {
        const { bars } = await fetchMinuteBars(sym)
        data[sym] = bars.map((b) => ({
          datetime: b.datetime,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
          amount: b.amount,
        }))
      } catch {
        data[sym] = []
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, symbols.length) }, worker))
  return { data, incremental: false }
})

route('GET', '/api/kline/minute-range', async ({ query }) => {
  const symbol = normalizeSymbol(query.get('symbol') ?? '')
  const { date, prevClose, bars } = await fetchMinuteBars(symbol)
  const session = date
    ? {
        date,
        prev_close: prevClose,
        rows: bars.map((b) => ({
          datetime: b.datetime,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
          amount: b.amount,
        })),
      }
    : null
  return {
    symbol,
    asset_type: assetTypeOf(symbol),
    requested_days: asNumber(query.get('days'), 10),
    sessions: session ? [session] : [],
    source: session ? 'local' : 'none',
  }
})

route('GET', '/api/kline/instruments/search', async ({ query }) => {
  const q = query.get('q') ?? ''
  const limit = asNumber(query.get('limit'), 20)
  return { results: await searchInstruments(q, limit) }
})

route('POST', '/api/kline/instruments/names', async ({ body }) => {
  const symbols: string[] = Array.isArray(body) ? body.map(String) : []
  const cached = await lookupNames(symbols)
  const missing = symbols.filter((s) => !cached[normalizeSymbol(s)])
  if (missing.length > 0) {
    try {
      const map = await fetchQuotes(missing)
      const fresh: Record<string, string> = {}
      for (const [sym, q] of map) fresh[sym] = q.name
      await rememberInstrumentNames(fresh)
      Object.assign(cached, fresh)
    } catch {
      // 名称拿不到就返回已知部分，不阻断
    }
  }
  return { names: cached }
})

// ---- 指数 ----

route('GET', '/api/index/daily', async ({ query }) => {
  const symbol = normalizeSymbol(query.get('symbol') ?? '')
  const days = asNumber(query.get('days'), 120)
  const series = await seriesOf(symbol)
  let rows = toKlineRows(series, symbol)
  const start = query.get('start_date')
  const end = query.get('end_date')
  if (start && end) rows = rows.filter((r) => r.date >= start && r.date <= end)
  else if (days > 0) rows = rows.slice(-Math.round(days))
  return { symbol, rows, source: 'local' }
})

route('GET', '/api/index/minute', async ({ query }) => {
  const symbol = normalizeSymbol(query.get('symbol') ?? '')
  const { date, bars } = await fetchMinuteBars(symbol)
  return {
    symbol,
    date,
    rows: bars.map((b) => ({
      datetime: b.datetime,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      amount: b.amount,
    })),
    source: bars.length ? 'live' : 'none',
  }
})

route('GET', '/api/intraday/indices', async ({ query }) => {
  const raw = query.get('symbols')
  const symbols = raw
    ? raw.split(',').map((s) => normalizeSymbol(s)).filter(Boolean)
    : ['000001.SH', '399001.SZ', '399006.SZ']
  const map = await fetchQuotes(symbols)
  const rows = symbols
    .map((s) => map.get(s))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => ({
      symbol: q.symbol,
      name: q.name,
      last_price: q.price,
      close: q.price,
      prev_close: q.prevClose,
      change_pct: q.changePct,
      change_amount: q.change,
      open: q.open,
      high: q.high,
      low: q.low,
      volume: q.volume,
      amount: q.amount,
      timestamp: q.timestamp,
    }))
  return { rows, count: rows.length }
})

route('GET', '/api/intraday/status', async () => ({
  enabled: true,
  running: true,
  mode: 'watchlist',
  interval_s: 3,
  symbol_count: (await listWatchlist()).length,
  quote_age_ms: 0,
  is_trading_hours: true,
  market_phase: 'local',
  last_fetch_ms: 0,
  local: true,
}))

route('POST', '/api/intraday/refresh', async () => {
  clearSeriesCache()
  return { status: 'ok' }
})

// ---- 看板 ----

route('GET', '/api/overview/market', async () => {
  const symbols = ['000001.SH', '399001.SZ', '399006.SZ', '000300.SH']
  const map = await fetchQuotes(symbols)
  const indices = symbols
    .map((s) => map.get(s))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => ({
      symbol: q.symbol,
      name: q.name,
      close: q.price,
      change_pct: q.changePct,
      change_amount: q.change,
      volume: q.volume,
      amount: q.amount,
    }))
  return {
    as_of: new Date().toISOString(),
    indices,
    // 本地没有全市场涨跌家数（需要遍历 5000 只），明确标注 unavailable 而不是编 0
    breadth: null,
    breadth_unavailable: 'local-mode',
    source: 'local',
  }
})

route('GET', '/api/data/version', async () => ({ version: '0.4.0-local' }))

route('GET', '/api/settings/preferences/quote-interval', async () => ({ interval: 3, min_interval: 1, max_interval: 60 }))

route('PUT', '/api/settings/preferences/quote-interval', async ({ body }) => {
  const interval = Math.max(1, Math.min(60, asNumber(body?.interval, 3)))
  return { interval, min_interval: 1, max_interval: 60 }
})

route('GET', '/health', async () => ({ status: 'ok', version: '0.4.0-local', mode: 'local' }))

// ---- 能力/数据源：返回空清单，让依赖它们的页面按"无此项"渲染，而不是整页报错 ----

route('GET', '/api/ext-data/schema-all', async () => ({ items: [] }))

route('GET', '/api/settings/data-sources', async () => ({ builtin: [], plugins: [], custom: [] }))

route('GET', '/api/data-sources', async () => ({ builtin: [], plugins: [], custom: [] }))

route('GET', '/api/capabilities', async () => ({ label: '本机模式', capabilities: {} }))

route('POST', '/api/capabilities/redetect', async () => ({ label: '本机模式', capabilities: {} }))

// ---- 设置 / 偏好 ----
//
// 后端的 preferences 有 40 多个细分端点，本地不可能逐一复刻语义。
// 这里用一张 KV 表兜住「读回来 / 写进去」这一层：
//   - 用户改过的开关、布局、导航顺序能留住（不再是刷新即丢）
//   - 需要后端配合的配置项（AI Key、webhook、数据源）仍会在界面上说明不可用
// 顺序上必须放在具体端点（如 quote-interval）之后，先命中先赢。

route('GET', '/api/settings', async () => ({
  mode: 'free' as const,
  tickflow_api_key_masked: '',
  has_tickflow_key: false,
  tier_label: '本机模式',
  current_endpoint: 'local://device',
  probe_log: [],
  missing_caps: [],
  extras_caps: [],
  onboarding_completed: true,
  ai_provider: 'none',
  ai_base_url: '',
  ai_api_key_masked: '',
  has_ai_key: false,
  ai_model: '',
  ai_user_agent: '',
  local_mode: true,
}))

route('POST', '/api/settings/onboarding/complete', async () => ({ onboarding_completed: true }))

route('GET', '/api/settings/preferences', async () => allPreferences())

route('PUT', '/api/settings/preferences', async ({ body }) => {
  if (body && typeof body === 'object') {
    for (const [k, v] of Object.entries(body)) await setPreference(k, v)
  }
  return allPreferences()
})

route('GET', '/api/settings/preferences/:key', async ({ params }) => {
  // 后端对未设置的偏好返回 {}，前端多处直接读字段，返回 null 会崩
  return (await getPreference<unknown>(params.key, null)) ?? {}
})

route('PUT', '/api/settings/preferences/:key', async ({ params, body }) => {
  await setPreference(params.key, body ?? {})
  return body ?? {}
})

route('PATCH', '/api/settings/preferences/:key', async ({ params, body }) => {
  await setPreference(params.key, body ?? {})
  return body ?? {}
})

// ===== 入口 =====

export interface LocalResponse<T = any> {
  status: number
  data: T
}

/**
 * 处理一个 `/api/*` 请求。找不到匹配路由时抛 501，而不是返回 `{}`
 * —— 空对象会让页面渲染出一堆 0，用户完全无法判断是「没数据」还是「不支持」。
 */
export async function handleLocalRequest<T = any>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method ?? 'GET').toUpperCase()
  let url: URL
  try {
    url = new URL(path, 'http://local.invalid')
  } catch {
    throw new LocalApiError(`本地模式无法解析请求路径: ${path}`, 400)
  }
  const pathname = url.pathname
  const body = parseBody(init?.body)

  for (const r of routes) {
    if (r.method !== method) continue
    const m = r.pattern.exec(pathname)
    if (!m) continue
    const params: Record<string, string> = {}
    r.keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1])
    })
    try {
      return (await r.handler({ method, pathname, query: url.searchParams, body, params })) as T
    } catch (e) {
      if (e instanceof LocalUnsupportedError) throw new LocalApiError(e.message, 501)
      if (e instanceof LocalApiError) throw e
      const msg = e instanceof Error ? e.message : String(e)
      throw new LocalApiError(`本地数据获取失败：${msg}`, 502)
    }
  }

  // 明确列出未支持的常见能力，报错信息直接告诉用户「这不是网络问题」
  const feature = guessFeature(pathname)
  throw new LocalApiError(
    `本地模式暂不支持「${feature}」。该功能需要后端的计算服务（策略/回测/AI/扩展数据），` +
      `手机单独运行无法完成；自选、行情、K 线、指标不受影响。`,
    501,
  )
}

function guessFeature(pathname: string): string {
  if (pathname.startsWith('/api/screener') || pathname.startsWith('/api/strategies')) return '选股与策略'
  if (pathname.startsWith('/api/backtest')) return '回测'
  if (pathname.startsWith('/api/regime')) return '市场状态分析'
  if (pathname.startsWith('/api/ext-data') || pathname.startsWith('/api/data-sources')) return '扩展数据源'
  if (pathname.startsWith('/api/financials')) return '财务数据'
  if (pathname.startsWith('/api/paper')) return '模拟盘'
  if (pathname.startsWith('/api/monitor') || pathname.startsWith('/api/alerts')) return '监控告警'
  if (pathname.startsWith('/api/ai') || pathname.startsWith('/api/reports')) return 'AI 研报'
  if (pathname.startsWith('/api/settings')) return '该设置项'
  return pathname.replace('/api/', '')
}

/** 该路径是否已由本地实现（用于设置页展示能力清单）。 */
export function isLocallySupported(method: string, path: string): boolean {
  let pathname = path
  try {
    pathname = new URL(path, 'http://local.invalid').pathname
  } catch {
    /* keep raw */
  }
  return routes.some((r) => r.method === method.toUpperCase() && r.pattern.test(pathname))
}

/** 已实现的端点清单（诊断/设置页用）。 */
export function localRouteTable(): { method: string; pattern: string }[] {
  return routes.map((r) => ({ method: r.method, pattern: r.pattern.source }))
}

/** 给设置页用：本地模式的行情能力摘要。 */
export function localCapabilities() {
  return {
    watchlist: true,
    realtimeQuote: true,
    dailyKline: true,
    minuteKline: true,
    indicators: true,
    indices: true,
    search: true,
    screener: false,
    backtest: false,
    ai: false,
  }
}

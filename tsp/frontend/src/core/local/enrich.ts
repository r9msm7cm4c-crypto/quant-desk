/**
 * 本地 enriched 行 —— 取代后端 `/api/watchlist/enriched`。
 *
 * 后端那一版是「DuckDB 读分区 parquet + 算 60+ 指标」，本地改成：
 *   实时快照（腾讯，一次 60 只）+ 日线历史（新浪，逐只，30 分钟缓存）→ 纯 TS 算指标。
 *
 * 为什么必须逐只取日线：指标（MA/RSI/MACD/60 日高低/连板）都是时序函数，
 * 没有历史就没有值；批量接口只能拿当日快照，算不出这些列。
 *
 * 代价与取舍：50 只自选首屏约需 50 个日线请求（并发 6，约 3-6 秒），
 * 之后 30 分钟内命中缓存秒开。宁可首屏慢一点，也不做「指标留空」——
 * 留空会让用户以为策略列坏了。
 */

import type { KlineRow } from '@/lib/api'
import { computeIndicators, computeSignals, countConsecutiveLimits, type IndicatorRow } from './indicators'
import { fetchDailyBars, fetchQuotes, type DailyBar, type RealtimeQuote } from './sources'
import { assetTypeOf, normalizeSymbol } from './symbol'
import { listWatchlist } from './store'

/** 日线并发数：太高会被源站限流，太低首屏等太久。 */
const CONCURRENCY = 6
/** 指标需要的最长窗口是 MA60 + 60 日动量 + 年化波动，260 根足够且留足冗余。 */
const BAR_COUNT = 260

/** 简单的并发闸门，避免 Promise.all 一次性打出几十个请求。 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

interface SymbolSeries {
  bars: DailyBar[]
  indicatorRows: IndicatorRow[]
}

const _seriesCache = new Map<string, { at: number; data: SymbolSeries }>()
const SERIES_TTL_MS = 30 * 60_000

async function loadSeries(symbol: string): Promise<SymbolSeries> {
  const hit = _seriesCache.get(symbol)
  if (hit && Date.now() - hit.at < SERIES_TTL_MS) return hit.data
  const { bars } = await fetchDailyBars(symbol, BAR_COUNT)
  const data: SymbolSeries = { bars, indicatorRows: computeIndicators(bars) }
  if (bars.length > 0) _seriesCache.set(symbol, { at: Date.now(), data })
  return data
}

export function clearSeriesCache(): void {
  _seriesCache.clear()
}

/** 某只标的的日线 + 指标（供 K 线接口复用，避免重复下载）。 */
export async function seriesOf(symbol: string): Promise<SymbolSeries> {
  return loadSeries(normalizeSymbol(symbol))
}

function round(v: number | null | undefined, digits = 3): number | null {
  if (v == null || !Number.isFinite(v)) return null
  const p = 10 ** digits
  return Math.round(v * p) / p
}

/**
 * 百分数 → 小数。
 *
 * 后端口径（frontend 的 fmtPct 直接 ×100 显示）：change_pct / amplitude /
 * momentum_* / annual_vol 都是小数（0.0177 = 1.77%）。
 * 本文件的指标计算内部用百分数更好读，所以只在出口处换算一次。
 * 例外：turnover_rate 与 rsi/kdj/vol_ratio 是百分数/比值，前端直接显示不加 %。
 */
function frac(pct: number | null | undefined): number | null {
  return pct == null || !Number.isFinite(pct) ? null : round(pct / 100, 5)
}

/** 组装一行 enriched。快照缺失（停牌/退市）时退化到日线最后一天。 */
function buildRow(
  symbol: string,
  entry: { added_at: string; note: string; group_ids: string[]; name: string | null },
  quote: RealtimeQuote | undefined,
  series: SymbolSeries | null,
): Record<string, any> {
  const bars = series?.bars ?? []
  const ind = series?.indicatorRows ?? []
  const last = ind[ind.length - 1]
  const lastBar = bars[bars.length - 1]
  const prevBar = bars[bars.length - 2]

  const close = lastBar?.close ?? quote?.price ?? null
  const prevClose = prevBar?.close ?? quote?.prevClose ?? null
  const changePct =
    quote?.changePct ??
    (close != null && prevClose ? (close / prevClose - 1) * 100 : null)
  const changeAmount = quote?.change ?? (close != null && prevClose != null ? close - prevClose : null)
  const amp =
    quote?.amplitude ??
    (prevClose && lastBar ? ((lastBar.high - lastBar.low) / prevClose) * 100 : null)

  // 流通股本 = 流通市值 / 现价；enriched 行的 float_val 由前端按 float_shares * 价格重算
  const floatShares =
    quote?.floatMarketCap && quote.price ? quote.floatMarketCap / quote.price : null

  const limits = bars.length ? countConsecutiveLimits(bars, symbol) : { ups: 0, downs: 0 }
  const signals = bars.length ? computeSignals(ind, symbol, bars) : {}

  // 加入自选以来的涨跌幅：用当日收盘对比加入日收盘（同日则 0）
  let pctSinceAdded: number | null = null
  if (close != null && entry.added_at) {
    const addedDate = String(entry.added_at).slice(0, 10)
    const base = bars.find((b) => b.date >= addedDate)
    if (base && base.close > 0) pctSinceAdded = (close / base.close - 1) * 100
  }

  return {
    symbol,
    name: quote?.name ?? entry.name ?? null,
    note: entry.note,
    asset_type: assetTypeOf(symbol),
    group_ids: entry.group_ids,
    added_at: entry.added_at,

    // 收盘口径（日线）
    close: round(close),
    prev_close: round(prevClose),
    open: round(quote?.open ?? lastBar?.open ?? null),
    high: round(quote?.high ?? lastBar?.high ?? null),
    low: round(quote?.low ?? lastBar?.low ?? null),
    volume: quote?.volume ?? lastBar?.volume ?? null,
    amount: quote?.amount ?? lastBar?.amount ?? null,
    change_pct: frac(changePct),
    change_amount: round(changeAmount),
    amplitude: frac(amp),
    turnover_rate: round(quote?.turnoverRate ?? null, 2),

    // 实时口径（自选页现价列优先用它）
    rt_price: round(quote?.price ?? null),
    rt_pct: frac(quote?.changePct ?? null),
    rt_amount: quote?.amount ?? null,
    rt_name: quote?.name ?? null,
    rt_time: quote?.timestamp ?? null,

    float_shares: floatShares,
    total_shares: quote?.totalMarketCap && quote.price ? quote.totalMarketCap / quote.price : null,
    pe_ttm: round(quote?.peTtm ?? null, 2),
    pb: round(quote?.pb ?? null, 2),
    limit_up_price: round(quote?.limitUp ?? null),
    limit_down_price: round(quote?.limitDown ?? null),

    // 指标列（字段名与后端一致，前端 stock-table.ts 按此取值）
    vol_ratio_5d: round(last?.volRatio5d ?? null, 2),
    annual_vol_20d: frac(last?.annualVol20 ?? null),
    ma5: round(last?.ma5 ?? null),
    ma10: round(last?.ma10 ?? null),
    ma20: round(last?.ma20 ?? null),
    ma60: round(last?.ma60 ?? null),
    vol_ma5: last?.volMa5 ?? null,
    vol_ma10: last?.volMa10 ?? null,
    high_60d: round(last?.high60 ?? null),
    low_60d: round(last?.low60 ?? null),
    rsi_6: round(last?.rsi6 ?? null, 2),
    rsi_14: round(last?.rsi14 ?? null, 2),
    rsi_24: round(last?.rsi24 ?? null, 2),
    macd_dif: round(last?.macdDif ?? null, 4),
    macd_dea: round(last?.macdDea ?? null, 4),
    macd_hist: round(last?.macdHist ?? null, 4),
    kdj_k: round(last?.kdjK ?? null, 2),
    kdj_d: round(last?.kdjD ?? null, 2),
    kdj_j: round(last?.kdjJ ?? null, 2),
    boll_upper: round(last?.bollUpper ?? null),
    boll_lower: round(last?.bollLower ?? null),
    atr_14: round(last?.atr14 ?? null),
    momentum_5d: frac(last?.momentum5 ?? null),
    momentum_10d: frac(last?.momentum10 ?? null),
    momentum_20d: frac(last?.momentum20 ?? null),
    momentum_30d: frac(last?.momentum30 ?? null),
    momentum_60d: frac(last?.momentum60 ?? null),
    consecutive_limit_ups: limits.ups,
    consecutive_limit_downs: limits.downs,
    pct_since_added: frac(pctSinceAdded),

    ...signals,

    // 该行数据日期 = 日线最后一根
    date: lastBar?.date ?? null,
  }
}

export interface EnrichedResult {
  rows: Record<string, any>[]
  as_of: string | null
  elapsed_ms: number
  dates?: { stock: string | null; etf: string | null; index: string | null }
}

/**
 * 构造自选页所需的全部行。
 * 单只标的取数失败不影响其余行 —— 该行退化成「只有实时快照」，
 * 指标列留空（前端显示 --），而不是整表报错。
 */
export async function buildEnriched(): Promise<EnrichedResult> {
  const started = Date.now()
  const entries = await listWatchlist()
  if (entries.length === 0) return { rows: [], as_of: null, elapsed_ms: Date.now() - started }

  const symbols = entries.map((e) => e.symbol)
  let quotes = new Map<string, RealtimeQuote>()
  try {
    quotes = await fetchQuotes(symbols)
  } catch {
    // 快照全失败时仍尝试用日线出数
  }

  const seriesList = await mapLimit(symbols, CONCURRENCY, async (sym) => {
    try {
      return await loadSeries(sym)
    } catch {
      return null
    }
  })

  const rows = entries.map((e, i) => buildRow(e.symbol, e, quotes.get(e.symbol), seriesList[i]))

  const dates: EnrichedResult['dates'] = { stock: null, etf: null, index: null }
  for (const r of rows) {
    const t = r.asset_type as 'stock' | 'etf' | 'index'
    if (r.date && (!dates[t] || String(r.date) > String(dates[t]))) dates[t] = r.date
  }
  const asOf = dates.stock ?? dates.etf ?? dates.index ?? null

  return { rows, as_of: asOf, elapsed_ms: Date.now() - started, dates }
}

/** 把指标序列转成 K 线接口的返回行（字段名与后端 KlineRow 对齐）。 */
export function toKlineRows(series: SymbolSeries, symbol: string): KlineRow[] {
  return series.indicatorRows.map((r, i) => {
    const bar = series.bars[i]
    return {
      date: r.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      amount: bar.amount ?? undefined,
      change_pct: r.changePct == null ? null : round(r.changePct / 100, 5),
      ma5: r.ma5,
      ma10: r.ma10,
      ma20: r.ma20,
      ma60: r.ma60,
      macd_dif: r.macdDif,
      macd_dea: r.macdDea,
      macd_hist: r.macdHist,
      rsi_6: r.rsi6,
      rsi_14: r.rsi14,
      rsi_24: r.rsi24,
      kdj_k: r.kdjK,
      kdj_d: r.kdjD,
      kdj_j: r.kdjJ,
      boll_upper: r.bollUpper,
      boll_lower: r.bollLower,
      atr_14: r.atr14,
      vol_ratio_5d: r.volRatio5d,
      symbol,
    } as KlineRow
  })
}

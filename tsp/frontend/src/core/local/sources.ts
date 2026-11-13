/**
 * 行情数据源 —— 直连公开行情站的只读接口。
 *
 * 分工（都实测过字段与可用性）：
 *   - 实时快照：腾讯 qt.gtimg.cn（GBK，一次可批量 60 只，字段最全：量比/换手/涨跌停/市值）
 *   - 日线历史：新浪 money.finance.sina.com.cn（JSON，前复权由 scale=240 提供原始收盘）
 *   - 分时：腾讯 web.ifzq.gtimg.cn/appstock/app/minute/query
 *   - 代码搜索：腾讯 smartbox.gtimg.cn
 *
 * 为什么不用东财：`push2*.eastmoney.com` 在当前网络下返回空体 / 被风控，
 * 而腾讯+新浪两个源都稳定可用，且互为备份（一个挂了另一个还能出数）。
 *
 * 这些接口都是公开只读的行情快照，等同浏览器打开行情页看到的内容；
 * 本地模式不落地存储这些数据以外的任何东西（见 core/local/store.ts）。
 */

import { httpGetJson, httpGetText, KLINE_TTL_MS, LocalNetworkError, QUOTE_TTL_MS, setCacheTtl } from './net'
import { parseSymbol, toSourceCode } from './symbol'

// ===== 实时快照 =====

export interface RealtimeQuote {
  symbol: string
  name: string
  price: number
  prevClose: number
  open: number
  high: number
  low: number
  /** 成交量（股） */
  volume: number
  /** 成交额（元） */
  amount: number
  change: number
  /** 涨跌幅，百分数（1.77 表示 +1.77%） */
  changePct: number
  /** 换手率，百分数 */
  turnoverRate: number | null
  /** 量比 */
  volRatio: number | null
  /** 振幅，百分数 */
  amplitude: number | null
  /** 流通市值（元） */
  floatMarketCap: number | null
  /** 总市值（元） */
  totalMarketCap: number | null
  peTtm: number | null
  pb: number | null
  limitUp: number | null
  limitDown: number | null
  /** 快照时间戳（毫秒） */
  timestamp: number | null
}

const QT_BATCH = 60

function num(v: string | undefined): number | null {
  if (v == null || v === '' || v === '-' || v === 'null') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 指数/停牌标的的涨跌停位是 -1，必须转成 null，否则前端会画出负价格。 */
function normalizeLimit(v: number | null): number | null {
  return v == null || v <= 0 ? null : v
}

function parseQtTimestamp(raw: string | undefined): number | null {
  // 20261113161455
  if (!raw || raw.length < 14) return null
  const y = Number(raw.slice(0, 4))
  const mo = Number(raw.slice(4, 6)) - 1
  const d = Number(raw.slice(6, 8))
  const h = Number(raw.slice(8, 10))
  const mi = Number(raw.slice(10, 12))
  const s = Number(raw.slice(12, 14))
  // 源站给的是北京时间，转成 UTC 毫秒需要减 8 小时
  return Date.UTC(y, mo, d, h, mi, s) - 8 * 3600_000
}

function parseQuoteLine(line: string): RealtimeQuote | null {
  const eq = line.indexOf('="')
  if (eq < 0) return null
  const varName = line.slice(0, eq).trim() // v_sh600519
  const body = line.slice(eq + 2).replace(/";?\s*$/, '')
  const f = body.split('~')
  if (f.length < 40) return null

  const code = f[2] || varName.replace(/^v_/, '').replace(/^(sh|sz|bj)/i, '')
  const exchange = varName.replace(/^v_/, '').slice(0, 2).toUpperCase()
  const symbol = parseSymbol(`${code}.${exchange}`)?.symbol ?? code

  const price = num(f[3]) ?? 0
  const prevClose = num(f[4]) ?? 0
  const volumeHand = num(f[36] ?? f[6]) ?? 0
  const amountWan = num(f[37]) ?? 0
  const floatMvYi = num(f[44])
  const totalMvYi = num(f[45])

  return {
    symbol,
    name: f[1] || code,
    price,
    prevClose,
    open: num(f[5]) ?? 0,
    high: num(f[33]) ?? 0,
    low: num(f[34]) ?? 0,
    volume: volumeHand * 100,
    amount: amountWan * 10_000,
    change: num(f[31]) ?? price - prevClose,
    changePct: num(f[32]) ?? (prevClose ? (price / prevClose - 1) * 100 : 0),
    turnoverRate: num(f[38]),
    volRatio: num(f[49]),
    amplitude: num(f[43]),
    floatMarketCap: floatMvYi == null ? null : floatMvYi * 1e8,
    totalMarketCap: totalMvYi == null ? null : totalMvYi * 1e8,
    peTtm: num(f[39]),
    pb: num(f[46]),
    limitUp: normalizeLimit(num(f[47])),
    limitDown: normalizeLimit(num(f[48])),
    timestamp: parseQtTimestamp(f[30]),
  }
}

/**
 * 批量拉实时快照。返回 Map 便于调用方按 symbol 对齐；
 * 单个标的缺失（停牌/退市/代码错）不会让整批失败。
 */
export async function fetchQuotes(symbols: string[]): Promise<Map<string, RealtimeQuote>> {
  const codes = Array.from(new Set(symbols.map(toSourceCode).filter((x): x is string => !!x)))
  const out = new Map<string, RealtimeQuote>()
  if (codes.length === 0) return out

  const batches: string[][] = []
  for (let i = 0; i < codes.length; i += QT_BATCH) batches.push(codes.slice(i, i + QT_BATCH))

  await Promise.all(
    batches.map(async (batch) => {
      const url = `https://qt.gtimg.cn/q=${batch.join(',')}`
      try {
        const text = await httpGetText(url, { encoding: 'gbk', timeoutMs: 10_000 })
        for (const line of text.split('\n')) {
          const q = parseQuoteLine(line)
          if (q) out.set(q.symbol, q)
        }
        setCacheTtl(url, QUOTE_TTL_MS, 'gbk')
      } catch {
        // 单批失败不抛出：其余批次与上一步缓存仍可用，页面显示"部分行情不可用"
      }
    }),
  )

  return out
}

// ===== 日线 =====

export interface DailyBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount: number | null
}

interface SinaBar {
  day?: string
  date?: string
  open?: string
  high?: string
  low?: string
  close?: string
  volume?: string
  amount?: string
}

/** 新浪单次最多返回约 1023 根；本地指标最多用 500 根，够 MA60/年化波动。 */
const SINA_MAX = 500

export async function fetchDailyBars(symbol: string, count = 300): Promise<{ bars: DailyBar[]; name?: string }> {
  const src = toSourceCode(symbol)
  if (!src) throw new LocalNetworkError(`无法识别的标的代码: ${symbol}`)
  const n = Math.max(30, Math.min(SINA_MAX, Math.round(count)))
  const url =
    `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData` +
    `?symbol=${src}&scale=240&ma=no&datalen=${n}`
  const raw = await httpGetJson<SinaBar[]>(url, { timeoutMs: 14_000 })
  if (!Array.isArray(raw)) throw new LocalNetworkError('日线数据格式异常')
  const bars: DailyBar[] = []
  for (const r of raw) {
    const date = String(r.day ?? r.date ?? '').slice(0, 10)
    const close = num(r.close)
    if (!date || close == null) continue
    bars.push({
      date,
      open: num(r.open) ?? close,
      high: num(r.high) ?? close,
      low: num(r.low) ?? close,
      close,
      volume: num(r.volume) ?? 0,
      amount: num(r.amount),
    })
  }
  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  setCacheTtl(url, KLINE_TTL_MS)
  return { bars }
}

// ===== 分时 =====

export interface MinuteBar {
  datetime: string
  open: number | null
  high: number
  low: number
  close: number
  volume: number
  amount: number | null
}

interface TencentMinuteResp {
  code?: number
  data?: Record<
    string,
    {
      data?: { date?: string; data?: string[]; prec?: string }
      qt?: Record<string, string[]>
    }
  >
}

/**
 * 当日分时（1 分钟）。腾讯返回 `HHMM 价格 累计量(手) 累计额(元)`，
 * 这里换算成「单分钟量」并补齐 OHLC（分时只有价格，O/H/L 取同一价格）。
 */
export async function fetchMinuteBars(symbol: string): Promise<{ date: string | null; prevClose: number | null; bars: MinuteBar[] }> {
  const src = toSourceCode(symbol)
  if (!src) throw new LocalNetworkError(`无法识别的标的代码: ${symbol}`)
  const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${src}&_var=`
  const resp = await httpGetJson<TencentMinuteResp>(url, { timeoutMs: 12_000 })
  const node = resp?.data?.[src]
  const inner = node?.data
  const lines = inner?.data ?? []
  const rawDate = inner?.date ?? null
  // 源站给 20261113，前端所有日期比较都按 YYYY-MM-DD，必须在此归一
  const date = rawDate && /^\d{8}$/.test(rawDate)
    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    : rawDate

  let prevClose: number | null = null
  const qtRow = node?.qt?.[src]
  if (Array.isArray(qtRow) && qtRow.length > 4) prevClose = num(qtRow[4])

  const bars: MinuteBar[] = []
  let prevCumVol = 0
  let prevCumAmt = 0
  for (const raw of lines) {
    const parts = String(raw).trim().split(/\s+/)
    if (parts.length < 3) continue
    const hhmm = parts[0]
    if (!/^\d{4}$/.test(hhmm)) continue
    const price = num(parts[1])
    if (price == null) continue
    const cumVol = num(parts[2]) ?? 0 // 手
    const cumAmt = num(parts[3]) ?? 0 // 元
    const vol = Math.max(0, cumVol - prevCumVol)
    const amt = Math.max(0, cumAmt - prevCumAmt)
    prevCumVol = cumVol
    prevCumAmt = cumAmt
    const iso = date ? `${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00` : `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`
    bars.push({
      datetime: iso,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: vol * 100,
      amount: amt || null,
    })
  }
  setCacheTtl(url, 60_000)
  return { date, prevClose, bars }
}

// ===== 搜索 =====

export interface SearchHit {
  symbol: string
  name: string
  code: string
  asset_type?: 'stock' | 'etf' | 'index'
}

/**
 * 代码/名称搜索。腾讯返回 `v_hint="sh~600519~贵州茅台~gzmt~GP-A^sz~000001~平安银行~payh~GP-A"`，
 * 支持中文名、拼音首字母、6 位代码。
 */
export async function searchInstruments(query: string, limit = 20): Promise<SearchHit[]> {
  const q = String(query ?? '').trim()
  if (!q) return []
  const url = `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(q)}&t=all`
  const text = await httpGetText(url, { encoding: 'gbk', timeoutMs: 8_000 })
  const m = /v_hint="([^"]*)"/.exec(text)
  if (!m) return []
  const body = m[1]
  if (!body || body === 'N') return []

  const hits: SearchHit[] = []
  for (const item of body.split('^')) {
    const f = item.split('~')
    if (f.length < 3) continue
    const ex = f[0].toUpperCase()
    if (!['SH', 'SZ', 'BJ'].includes(ex)) continue
    const code = f[1]
    // smartbox 对中文返回 \uXXXX 字面量（不是 JSON 转义），需要手动还原
    const name = f[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    const kind = f[4] || ''
    const symbol = parseSymbol(`${code}.${ex}`)?.symbol
    if (!symbol) continue
    const asset_type = /ZS/i.test(kind) ? 'index' : /ETF|LOF|JJ/i.test(kind) ? 'etf' : 'stock'
    hits.push({ symbol, name, code, asset_type })
    if (hits.length >= limit) break
  }
  return hits
}

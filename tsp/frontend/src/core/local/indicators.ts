/**
 * 技术指标 —— 纯函数，输入日线，输出与输入等长的指标序列。
 *
 * 口径说明（与通达信/同花顺对齐，避免和用户盯盘软件对不上）：
 *   - RSI 用 Wilder 平滑（SMA(X,N,1)），不是简单均值
 *   - KDJ 用 9/3/3，K、D 均用 SMA(...,3,1)
 *   - MACD 用 12/26/9，柱 = (DIF-DEA)*2
 *   - BOLL 用 20 日、2 倍标准差（总体标准差，与通达信 STD 一致）
 *   - ATR 用 14 日 Wilder
 *
 * 所有函数对「数据不足」的处理都是返回 null，而不是用 0 填充 ——
 * 0 会被前端当成真实值画进图里，比缺失更误导。
 */

import type { DailyBar } from './sources'

export interface IndicatorRow {
  date: string
  close: number
  ma5: number | null
  ma10: number | null
  ma20: number | null
  ma60: number | null
  volMa5: number | null
  volMa10: number | null
  rsi6: number | null
  rsi14: number | null
  rsi24: number | null
  macdDif: number | null
  macdDea: number | null
  macdHist: number | null
  kdjK: number | null
  kdjD: number | null
  kdjJ: number | null
  bollUpper: number | null
  bollLower: number | null
  bollMid: number | null
  atr14: number | null
  high60: number | null
  low60: number | null
  momentum5: number | null
  momentum10: number | null
  momentum20: number | null
  momentum30: number | null
  momentum60: number | null
  annualVol20: number | null
  volRatio5d: number | null
  changePct: number | null
}

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** Wilder 平滑（通达信 SMA(X,N,1)）：y = (x + (N-1)*y_prev) / N */
function wilder(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  let prev: number | null = null
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (prev == null) {
      if (i >= period - 1) {
        let sum = 0
        for (let k = i - period + 1; k <= i; k++) sum += values[k]
        prev = sum / period
        out[i] = prev
      }
      continue
    }
    prev = (v + (period - 1) * prev) / period
    out[i] = prev
  }
  return out
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = values[0] ?? 0
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

function populationStd(values: number[], period: number, endIdx: number): number | null {
  if (endIdx - period + 1 < 0) return null
  let sum = 0
  for (let i = endIdx - period + 1; i <= endIdx; i++) sum += values[i]
  const mean = sum / period
  let sq = 0
  for (let i = endIdx - period + 1; i <= endIdx; i++) sq += (values[i] - mean) ** 2
  return Math.sqrt(sq / period)
}

export function computeIndicators(bars: DailyBar[]): IndicatorRow[] {
  const n = bars.length
  if (n === 0) return []
  const closes = bars.map((b) => b.close)
  const highs = bars.map((b) => b.high)
  const lows = bars.map((b) => b.low)
  const vols = bars.map((b) => b.volume)

  const ma5 = sma(closes, 5)
  const ma10 = sma(closes, 10)
  const ma20 = sma(closes, 20)
  const ma60 = sma(closes, 60)
  const volMa5 = sma(vols, 5)
  const volMa10 = sma(vols, 10)

  // RSI
  const gains: number[] = [0]
  const losses: number[] = [0]
  for (let i = 1; i < n; i++) {
    const diff = closes[i] - closes[i - 1]
    gains.push(Math.max(0, diff))
    losses.push(Math.max(0, -diff))
  }
  const rsiOf = (period: number) => {
    const g = wilder(gains, period)
    const l = wilder(losses, period)
    return g.map((gv, i) => {
      const lv = l[i]
      if (gv == null || lv == null) return null
      if (gv + lv === 0) return 50
      return (gv / (gv + lv)) * 100
    })
  }
  const rsi6 = rsiOf(6)
  const rsi14 = rsiOf(14)
  const rsi24 = rsiOf(24)

  // MACD
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const dif = closes.map((_, i) => ema12[i] - ema26[i])
  const dea = ema(dif, 9)
  const hist = dif.map((d, i) => (d - dea[i]) * 2)

  // KDJ
  const kArr: (number | null)[] = new Array(n).fill(null)
  const dArr: (number | null)[] = new Array(n).fill(null)
  const jArr: (number | null)[] = new Array(n).fill(null)
  let prevK = 50
  let prevD = 50
  for (let i = 0; i < n; i++) {
    if (i < 8) continue
    let hh = -Infinity
    let ll = Infinity
    for (let k = i - 8; k <= i; k++) {
      hh = Math.max(hh, highs[k])
      ll = Math.min(ll, lows[k])
    }
    const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100
    const k = (2 * prevK + rsv) / 3
    const d = (2 * prevD + k) / 3
    prevK = k
    prevD = d
    kArr[i] = k
    dArr[i] = d
    jArr[i] = 3 * k - 2 * d
  }

  // BOLL
  const bollMid = sma(closes, 20)
  const bollUpper: (number | null)[] = new Array(n).fill(null)
  const bollLower: (number | null)[] = new Array(n).fill(null)
  for (let i = 19; i < n; i++) {
    const std = populationStd(closes, 20, i)
    const mid = bollMid[i]
    if (std == null || mid == null) continue
    bollUpper[i] = mid + 2 * std
    bollLower[i] = mid - 2 * std
  }

  // ATR(14)
  const tr: number[] = [0]
  for (let i = 1; i < n; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])))
  }
  const atr14 = wilder(tr, 14)

  // 区间 / 动量 / 波动
  const high60: (number | null)[] = new Array(n).fill(null)
  const low60: (number | null)[] = new Array(n).fill(null)
  for (let i = 59; i < n; i++) {
    let hh = -Infinity
    let ll = Infinity
    for (let k = i - 59; k <= i; k++) {
      hh = Math.max(hh, highs[k])
      ll = Math.min(ll, lows[k])
    }
    high60[i] = hh
    low60[i] = ll
  }

  const momentum = (period: number) =>
    closes.map((c, i) => (i >= period && closes[i - period] > 0 ? (c / closes[i - period] - 1) * 100 : null))

  const annualVol20: (number | null)[] = new Array(n).fill(null)
  for (let i = 20; i < n; i++) {
    const rets: number[] = []
    for (let k = i - 19; k <= i; k++) {
      if (closes[k - 1] > 0) rets.push(closes[k] / closes[k - 1] - 1)
    }
    if (rets.length < 2) continue
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)
    annualVol20[i] = Math.sqrt(variance) * Math.sqrt(250) * 100
  }

  const volRatio5d = vols.map((v, i) => {
    if (i < 5) return null
    let sum = 0
    for (let k = i - 5; k < i; k++) sum += vols[k]
    const avg = sum / 5
    return avg > 0 ? v / avg : null
  })

  const m5 = momentum(5)
  const m10 = momentum(10)
  const m20 = momentum(20)
  const m30 = momentum(30)
  const m60 = momentum(60)

  return bars.map((b, i) => ({
    date: b.date,
    close: b.close,
    ma5: ma5[i],
    ma10: ma10[i],
    ma20: ma20[i],
    ma60: ma60[i],
    volMa5: volMa5[i],
    volMa10: volMa10[i],
    rsi6: rsi6[i],
    rsi14: rsi14[i],
    rsi24: rsi24[i],
    macdDif: dif[i],
    macdDea: dea[i],
    macdHist: hist[i],
    kdjK: kArr[i],
    kdjD: dArr[i],
    kdjJ: jArr[i],
    bollUpper: bollUpper[i],
    bollLower: bollLower[i],
    bollMid: bollMid[i],
    atr14: atr14[i],
    high60: high60[i],
    low60: low60[i],
    momentum5: m5[i],
    momentum10: m10[i],
    momentum20: m20[i],
    momentum30: m30[i],
    momentum60: m60[i],
    annualVol20: annualVol20[i],
    volRatio5d: volRatio5d[i],
    changePct: i > 0 && closes[i - 1] > 0 ? (b.close / closes[i - 1] - 1) * 100 : null,
  }))
}

// ===== 涨停判定 =====

/** 涨跌幅限制（百分数）：主板 10，创业板/科创板 20，北交所 30，ST 5（无法从行情源可靠识别，按板块给）。 */
export function limitRateOf(symbol: string): number {
  const code = symbol.split('.')[0]
  if (/^(30|68)/.test(code)) return 20
  if (/^(4|8|92)/.test(code)) return 30
  return 10
}

/**
 * 连续涨停/跌停天数（从最后一根往前数）。
 * 用收盘价相对前收的涨幅与板块限幅比较，容忍 0.2 个百分点的四舍五入误差。
 */
export function countConsecutiveLimits(bars: DailyBar[], symbol: string): { ups: number; downs: number } {
  const rate = limitRateOf(symbol)
  let ups = 0
  let downs = 0
  for (let i = bars.length - 1; i > 0; i--) {
    const prev = bars[i - 1].close
    if (!prev) break
    const pct = (bars[i].close / prev - 1) * 100
    if (pct >= rate - 0.2) ups++
    else break
  }
  for (let i = bars.length - 1; i > 0; i--) {
    const prev = bars[i - 1].close
    if (!prev) break
    const pct = (bars[i].close / prev - 1) * 100
    if (pct <= -rate + 0.2) downs++
    else break
  }
  return { ups, downs }
}

/** 14 个信号位（与前端 SIGNAL_FIELDS 一一对应）。 */
export function computeSignals(rows: IndicatorRow[], symbol: string, bars: DailyBar[]): Record<string, boolean> {
  const last = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  if (!last) return {}
  const limits = countConsecutiveLimits(bars, symbol)
  const rate = limitRateOf(symbol)

  const crossUp = (a: number | null, b: number | null, pa: number | null, pb: number | null) =>
    a != null && b != null && pa != null && pb != null && pa <= pb && a > b
  const crossDown = (a: number | null, b: number | null, pa: number | null, pb: number | null) =>
    a != null && b != null && pa != null && pb != null && pa >= pb && a < b

  return {
    signal_limit_up: (last.changePct ?? 0) >= rate - 0.2,
    // 反包：昨日跌停/接近跌停而今日涨停
    signal_broken_board_recovery: (prev?.changePct ?? 0) <= -rate + 0.2 && (last.changePct ?? 0) >= rate - 0.2,
    signal_volume_surge: (last.volRatio5d ?? 0) >= 1.8,
    signal_ma_golden_5_20: crossUp(last.ma5, last.ma20, prev?.ma5 ?? null, prev?.ma20 ?? null),
    signal_ma_dead_5_20: crossDown(last.ma5, last.ma20, prev?.ma5 ?? null, prev?.ma20 ?? null),
    signal_ma_golden_20_60: crossUp(last.ma20, last.ma60, prev?.ma20 ?? null, prev?.ma60 ?? null),
    signal_macd_golden: crossUp(last.macdDif, last.macdDea, prev?.macdDif ?? null, prev?.macdDea ?? null),
    signal_macd_dead: crossDown(last.macdDif, last.macdDea, prev?.macdDif ?? null, prev?.macdDea ?? null),
    signal_ma20_breakout: last.ma20 != null && last.close > last.ma20 && (prev?.close ?? 0) <= (prev?.ma20 ?? Infinity),
    signal_ma20_breakdown: last.ma20 != null && last.close < last.ma20 && (prev?.close ?? 0) >= (prev?.ma20 ?? -Infinity),
    signal_n_day_high: limits.ups === 0 && last.high60 != null && last.close >= last.high60 - 1e-6,
    signal_n_day_low: last.low60 != null && last.close <= last.low60 + 1e-6,
    signal_boll_breakout_upper: last.bollUpper != null && last.close > last.bollUpper,
    signal_boll_breakdown_lower: last.bollLower != null && last.close < last.bollLower,
  }
}

import { describe, expect, it } from 'vitest'
import { computeIndicators, countConsecutiveLimits, limitRateOf } from './indicators'
import type { DailyBar } from './sources'

/** 构造 n 根单调上涨的日线，便于断言已知结果。 */
function rampBars(n: number, start = 10, step = 0.1): DailyBar[] {
  return Array.from({ length: n }, (_, i) => {
    const close = start + i * step
    return {
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open: close - step / 2,
      high: close + step,
      low: close - step,
      close,
      volume: 1_000_000 + i * 1000,
      amount: null,
    }
  })
}

describe('computeIndicators', () => {
  it('空输入返回空数组', () => {
    expect(computeIndicators([])).toEqual([])
  })

  it('输出与输入等长且日期对齐', () => {
    const bars = rampBars(80)
    const rows = computeIndicators(bars)
    expect(rows).toHaveLength(80)
    expect(rows[79].date).toBe(bars[79].date)
    expect(rows[79].close).toBe(bars[79].close)
  })

  it('数据不足时返回 null 而不是 0', () => {
    const rows = computeIndicators(rampBars(10))
    expect(rows[9].ma5).not.toBeNull()
    expect(rows[9].ma20).toBeNull()
    expect(rows[9].ma60).toBeNull()
    expect(rows[9].rsi14).toBeNull()
    expect(rows[9].bollUpper).toBeNull()
    expect(rows[9].high60).toBeNull()
  })

  it('MA5 等于最近 5 根收盘均值', () => {
    const bars = rampBars(30)
    const rows = computeIndicators(bars)
    const last = bars.slice(-5)
    const expectMa5 = last.reduce((a, b) => a + b.close, 0) / 5
    expect(rows[29].ma5).toBeCloseTo(expectMa5, 6)
  })

  it('单调上涨时 RSI 收敛到 100', () => {
    const rows = computeIndicators(rampBars(60))
    expect(rows[59].rsi6).toBeCloseTo(100, 4)
    expect(rows[59].rsi14).toBeCloseTo(100, 4)
  })

  it('单调上涨时 MACD 柱为正、DIF 在 DEA 上方', () => {
    const rows = computeIndicators(rampBars(120))
    const last = rows[119]
    expect(last.macdDif!).toBeGreaterThan(last.macdDea!)
    expect(last.macdHist!).toBeGreaterThan(0)
  })

  it('BOLL 上轨高于中轨、下轨低于中轨', () => {
    const rows = computeIndicators(rampBars(60))
    const last = rows[59]
    expect(last.bollUpper!).toBeGreaterThan(last.bollMid!)
    expect(last.bollLower!).toBeLessThan(last.bollMid!)
  })

  it('横盘时布林带收窄', () => {
    const flat: DailyBar[] = Array.from({ length: 40 }, (_, i) => ({
      date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      volume: 1000,
      amount: null,
    }))
    const rows = computeIndicators(flat)
    expect(rows[39].bollUpper!).toBeCloseTo(10, 6)
    expect(rows[39].bollLower!).toBeCloseTo(10, 6)
  })

  it('60 日动量按收盘对比 60 根之前', () => {
    const bars = rampBars(80, 10, 0.1)
    const rows = computeIndicators(bars)
    const expected = (bars[79].close / bars[19].close - 1) * 100
    expect(rows[79].momentum60).toBeCloseTo(expected, 6)
  })

  it('量比用前 5 日均量（不含当日）', () => {
    const bars = rampBars(10)
    bars[9].volume = 2_000_000
    const rows = computeIndicators(bars)
    const avg = bars.slice(4, 9).reduce((a, b) => a + b.volume, 0) / 5
    expect(rows[9].volRatio5d).toBeCloseTo(2_000_000 / avg, 6)
  })
})

describe('limitRateOf', () => {
  it('按板块给出涨跌幅限制', () => {
    expect(limitRateOf('600519.SH')).toBe(10)
    expect(limitRateOf('300750.SZ')).toBe(20)
    expect(limitRateOf('688981.SH')).toBe(20)
    expect(limitRateOf('830799.BJ')).toBe(30)
  })
})

describe('countConsecutiveLimits', () => {
  function bar(date: string, close: number): DailyBar {
    return { date, open: close, high: close, low: close, close, volume: 1, amount: null }
  }

  it('数出连续涨停天数', () => {
    const bars = [bar('2026-01-01', 10), bar('2026-01-02', 11), bar('2026-01-03', 12.1), bar('2026-01-04', 13.31)]
    expect(countConsecutiveLimits(bars, '600519.SH').ups).toBe(3)
  })

  it('中间断板则只数最近一段', () => {
    const bars = [bar('2026-01-01', 10), bar('2026-01-02', 11), bar('2026-01-03', 11.5), bar('2026-01-04', 12.65)]
    expect(countConsecutiveLimits(bars, '600519.SH').ups).toBe(1)
  })

  it('数出连续跌停天数', () => {
    const bars = [bar('2026-01-01', 10), bar('2026-01-02', 9), bar('2026-01-03', 8.1)]
    expect(countConsecutiveLimits(bars, '600519.SH').downs).toBe(2)
  })

  it('创业板 20% 涨停不被算作主板涨停', () => {
    const bars = [bar('2026-01-01', 10), bar('2026-01-02', 11)]
    expect(countConsecutiveLimits(bars, '300750.SZ').ups).toBe(0)
  })
})

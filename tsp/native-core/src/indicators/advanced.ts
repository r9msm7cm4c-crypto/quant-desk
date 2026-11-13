import { assertFiniteSeries, assertPeriod, type OHLCVBar, type NullableSeries } from '../types.ts';

function validateBars(bars: readonly OHLCVBar[]): void {
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i]!;
    const values = [b.open, b.high, b.low, b.close, b.volume];
    if (!values.every(Number.isFinite)) throw new TypeError(`bars[${i}] contains a non-finite value`);
    if (b.high < b.low || b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close)) {
      throw new RangeError(`bars[${i}] has inconsistent OHLC values`);
    }
    if (b.volume < 0) throw new RangeError(`bars[${i}].volume must be >= 0`);
  }
}

/** True range. The first bar uses high-low because no previous close exists. */
export function trueRange(bars: readonly OHLCVBar[]): NullableSeries {
  validateBars(bars);
  return bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const previousClose = bars[i - 1]!.close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });
}

/** Wilder ATR; first value appears at period - 1. */
export function atr(bars: readonly OHLCVBar[], period = 14): NullableSeries {
  const p = assertPeriod(period, 2);
  const tr = trueRange(bars);
  const out: NullableSeries = Array(bars.length).fill(null);
  if (bars.length < p) return out;
  let seed = 0;
  for (let i = 0; i < p; i += 1) seed += tr[i]!;
  let previous = seed / p;
  out[p - 1] = previous;
  for (let i = p; i < bars.length; i += 1) {
    previous = (previous * (p - 1) + tr[i]!) / p;
    out[i] = previous;
  }
  return out;
}

/** Directional movement system. ADX is a trend-strength measure, not direction. */
export function adx(bars: readonly OHLCVBar[], period = 14) {
  const p = assertPeriod(period, 2);
  validateBars(bars);
  const plusDi: NullableSeries = Array(bars.length).fill(null);
  const minusDi: NullableSeries = Array(bars.length).fill(null);
  const dx: NullableSeries = Array(bars.length).fill(null);
  const adxValues: NullableSeries = Array(bars.length).fill(null);
  if (bars.length <= p) return { plusDi, minusDi, dx, adx: adxValues };

  const tr = trueRange(bars);
  const plusDm: number[] = Array(bars.length).fill(0);
  const minusDm: number[] = Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i += 1) {
    const up = bars[i]!.high - bars[i - 1]!.high;
    const down = bars[i - 1]!.low - bars[i]!.low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
  }

  let trSum = 0;
  let plusSum = 0;
  let minusSum = 0;
  for (let i = 1; i <= p; i += 1) {
    trSum += tr[i]!;
    plusSum += plusDm[i]!;
    minusSum += minusDm[i]!;
  }
  const write = (i: number) => {
    const pdi = trSum === 0 ? 0 : 100 * plusSum / trSum;
    const mdi = trSum === 0 ? 0 : 100 * minusSum / trSum;
    plusDi[i] = pdi;
    minusDi[i] = mdi;
    const denom = pdi + mdi;
    dx[i] = denom === 0 ? 0 : 100 * Math.abs(pdi - mdi) / denom;
  };
  write(p);
  for (let i = p + 1; i < bars.length; i += 1) {
    trSum = trSum - trSum / p + tr[i]!;
    plusSum = plusSum - plusSum / p + plusDm[i]!;
    minusSum = minusSum - minusSum / p + minusDm[i]!;
    write(i);
  }

  const firstAdxIndex = p * 2 - 1;
  if (firstAdxIndex < bars.length) {
    let seed = 0;
    for (let i = p; i <= firstAdxIndex; i += 1) seed += dx[i]!;
    let current = seed / p;
    adxValues[firstAdxIndex] = current;
    for (let i = firstAdxIndex + 1; i < bars.length; i += 1) {
      current = (current * (p - 1) + dx[i]!) / p;
      adxValues[i] = current;
    }
  }
  return { plusDi, minusDi, dx, adx: adxValues };
}

/** Stochastic oscillator. %K uses the trailing high/low range; %D is SMA(%K). */
export function stochastic(
  bars: readonly OHLCVBar[],
  period = 14,
  smoothK = 1,
  smoothD = 3,
) {
  const p = assertPeriod(period, 2);
  const sk = assertPeriod(smoothK);
  const sd = assertPeriod(smoothD);
  validateBars(bars);
  const rawK: NullableSeries = Array(bars.length).fill(null);
  for (let i = p - 1; i < bars.length; i += 1) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - p + 1; j <= i; j += 1) {
      highest = Math.max(highest, bars[j]!.high);
      lowest = Math.min(lowest, bars[j]!.low);
    }
    rawK[i] = highest === lowest ? 50 : 100 * (bars[i]!.close - lowest) / (highest - lowest);
  }
  const k: NullableSeries = Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p + sk - 2) continue;
    const window = rawK.slice(i - sk + 1, i + 1);
    if (window.every(v => v !== null)) k[i] = window.reduce((a, v) => a + v!, 0) / sk;
  }
  const d: NullableSeries = Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p + sk + sd - 3) continue;
    const window = k.slice(i - sd + 1, i + 1);
    if (window.every(v => v !== null)) d[i] = window.reduce((a, v) => a + v!, 0) / sd;
  }
  return { k, d };
}

/** On-balance volume; starts at zero and accumulates signed volume. */
export function obv(bars: readonly OHLCVBar[]): number[] {
  validateBars(bars);
  if (bars.length === 0) return [];
  const out = Array<number>(bars.length).fill(0);
  for (let i = 1; i < bars.length; i += 1) {
    const direction = Math.sign(bars[i]!.close - bars[i - 1]!.close);
    out[i] = out[i - 1]! + direction * bars[i]!.volume;
  }
  return out;
}

/** Annualized historical volatility from log returns, using sample standard deviation. */
export function realizedVolatility(
  closes: readonly number[],
  period = 20,
  annualization = 252,
): NullableSeries {
  const p = assertPeriod(period, 2);
  assertFiniteSeries(closes);
  if (!Number.isFinite(annualization) || annualization <= 0) {
    throw new RangeError('annualization must be > 0');
  }
  const out: NullableSeries = Array(closes.length).fill(null);
  for (let i = p; i < closes.length; i += 1) {
    const returns: number[] = [];
    for (let j = i - p + 1; j <= i; j += 1) {
      const previous = closes[j - 1]!;
      const current = closes[j]!;
      if (previous <= 0 || current <= 0) throw new RangeError('closes must be > 0 for log returns');
      returns.push(Math.log(current / previous));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / p;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (p - 1);
    out[i] = Math.sqrt(variance * annualization);
  }
  return out;
}

/** Donchian channel using the current bar in the trailing window. */
export function donchian(bars: readonly OHLCVBar[], period = 20) {
  const p = assertPeriod(period, 2);
  validateBars(bars);
  const upper: NullableSeries = Array(bars.length).fill(null);
  const lower: NullableSeries = Array(bars.length).fill(null);
  const middle: NullableSeries = Array(bars.length).fill(null);
  for (let i = p - 1; i < bars.length; i += 1) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = i - p + 1; j <= i; j += 1) {
      high = Math.max(high, bars[j]!.high);
      low = Math.min(low, bars[j]!.low);
    }
    upper[i] = high;
    lower[i] = low;
    middle[i] = (high + low) / 2;
  }
  return { upper, middle, lower };
}

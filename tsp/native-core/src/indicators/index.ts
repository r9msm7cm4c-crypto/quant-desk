import { assertFiniteSeries, assertPeriod, type NullableSeries } from '../types.ts';

/** SMA semantics match the existing offline PWA: first value appears at period - 1. */
export function sma(values: readonly number[], period: number): NullableSeries {
  const p = assertPeriod(period);
  assertFiniteSeries(values);
  const out: NullableSeries = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]!;
    if (i >= p) sum -= values[i - p]!;
    if (i >= p - 1) out[i] = sum / p;
  }
  return out;
}

/** EMA uses an SMA seed after p valid observations, matching the existing PWA. */
export function ema(values: readonly (number | null)[], period: number): NullableSeries {
  const p = assertPeriod(period);
  assertFiniteSeries(values);
  const k = 2 / (p + 1);
  const out: NullableSeries = [];
  let previous: number | null = null;
  let count = 0;
  let seedSum = 0;
  for (const value of values) {
    if (value === null) { out.push(null); continue; }
    if (previous === null) {
      seedSum += value;
      count += 1;
      if (count < p) { out.push(null); continue; }
      previous = seedSum / p;
      out.push(previous);
      continue;
    }
    previous = value * k + previous * (1 - k);
    out.push(previous);
  }
  return out;
}

/** Wilder RSI; first output is at index period, as in the original PWA. */
export function rsi(values: readonly number[], period: number): NullableSeries {
  const p = assertPeriod(period, 2);
  assertFiniteSeries(values);
  const out: NullableSeries = Array(values.length).fill(null);
  if (values.length <= p) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= p; i += 1) {
    const delta = values[i]! - values[i - 1]!;
    if (delta > 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / p;
  let avgLoss = loss / p;
  out[p] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = p + 1; i < values.length; i += 1) {
    const delta = values[i]! - values[i - 1]!;
    avgGain = (avgGain * (p - 1) + (delta > 0 ? delta : 0)) / p;
    avgLoss = (avgLoss * (p - 1) + (delta < 0 ? -delta : 0)) / p;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(values: readonly number[], fast = 12, slow = 26, signal = 9) {
  if (fast >= slow) throw new RangeError('fast period must be smaller than slow period');
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const dif = values.map((_, i) => fastEma[i] !== null && slowEma[i] !== null
    ? fastEma[i]! - slowEma[i]! : null);
  const dea = ema(dif, signal);
  const hist = values.map((_, i) => dif[i] !== null && dea[i] !== null
    ? (dif[i]! - dea[i]!) * 2 : null);
  return { dif, dea, hist };
}

/** Population standard deviation (divide by p), matching the PWA Bollinger calculation. */
export function bollinger(values: readonly number[], period = 20, multiplier = 2) {
  const p = assertPeriod(period, 2);
  if (!Number.isFinite(multiplier) || multiplier < 0) throw new RangeError('multiplier must be >= 0');
  const mid = sma(values, p);
  const upper: NullableSeries = Array(values.length).fill(null);
  const lower: NullableSeries = Array(values.length).fill(null);
  for (let i = p - 1; i < values.length; i += 1) {
    const mean = mid[i]!;
    let sumSquares = 0;
    for (let j = i - p + 1; j <= i; j += 1) sumSquares += (values[j]! - mean) ** 2;
    const deviation = Math.sqrt(sumSquares / p);
    upper[i] = mean + multiplier * deviation;
    lower[i] = mean - multiplier * deviation;
  }
  return { mid, upper, lower };
}

export function highest(values: readonly number[], period: number): NullableSeries {
  const p = assertPeriod(period);
  assertFiniteSeries(values);
  const out: NullableSeries = Array(values.length).fill(null);
  for (let i = p - 1; i < values.length; i += 1) {
    let maximum = -Infinity;
    for (let j = i - p + 1; j <= i; j += 1) maximum = Math.max(maximum, values[j]!);
    out[i] = maximum;
  }
  return out;
}

export function lowest(values: readonly number[], period: number): NullableSeries {
  const p = assertPeriod(period);
  assertFiniteSeries(values);
  const out: NullableSeries = Array(values.length).fill(null);
  for (let i = p - 1; i < values.length; i += 1) {
    let minimum = Infinity;
    for (let j = i - p + 1; j <= i; j += 1) minimum = Math.min(minimum, values[j]!);
    out[i] = minimum;
  }
  return out;
}

import { assertFiniteSeries, type OHLCVBar } from '../types.ts';
import { mean, standardDeviation } from './statistics.ts';

/**
 * Donchian breakout signals compare today's close with the prior N completed bars.
 * +1 = close above prior high; -1 = close below prior low; 0 = no event.
 */
export function donchianBreakoutSignals(
  bars: readonly OHLCVBar[],
  lookback = 20,
): Array<-1 | 0 | 1> {
  if (!Number.isInteger(lookback) || lookback < 2) throw new RangeError('lookback must be >= 2');
  const signals: Array<-1 | 0 | 1> = Array(bars.length).fill(0);
  for (let i = lookback; i < bars.length; i += 1) {
    let previousHigh = -Infinity;
    let previousLow = Infinity;
    for (let j = i - lookback; j < i; j += 1) {
      previousHigh = Math.max(previousHigh, bars[j]!.high);
      previousLow = Math.min(previousLow, bars[j]!.low);
    }
    signals[i] = bars[i]!.close > previousHigh ? 1 : bars[i]!.close < previousLow ? -1 : 0;
  }
  return signals;
}

/** Mean-reversion z-score against the preceding window, excluding the current observation. */
export function meanReversionZScores(values: readonly number[], lookback = 20): Array<number | null> {
  assertFiniteSeries(values);
  if (!Number.isInteger(lookback) || lookback < 3) throw new RangeError('lookback must be >= 3');
  const out: Array<number | null> = Array(values.length).fill(null);
  for (let i = lookback; i < values.length; i += 1) {
    const baseline = values.slice(i - lookback, i);
    const deviation = standardDeviation(baseline);
    if (deviation === null || deviation === 0) continue;
    out[i] = (values[i]! - mean(baseline)!) / deviation;
  }
  return out;
}

export function meanReversionSignals(
  zScores: readonly (number | null)[],
  entryThreshold = 2,
): Array<-1 | 0 | 1> {
  if (!Number.isFinite(entryThreshold) || entryThreshold <= 0) {
    throw new RangeError('entryThreshold must be > 0');
  }
  return zScores.map(value => value === null ? 0 : value >= entryThreshold ? -1 : value <= -entryThreshold ? 1 : 0);
}

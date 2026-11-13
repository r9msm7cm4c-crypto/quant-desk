import { assertFiniteSeries, type NullableSeries } from '../types.ts';

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  assertFiniteSeries(values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: readonly number[], sample = false): number | null {
  if (values.length === 0 || (sample && values.length < 2)) return null;
  const average = mean(values)!;
  const divisor = sample ? values.length - 1 : values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / divisor);
}

/** Linear-interpolated quantile. q must be in [0, 1]. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  if (!Number.isFinite(q) || q < 0 || q > 1) throw new RangeError('q must be between 0 and 1');
  assertFiniteSeries(values);
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower]! + (sorted[Math.min(lower + 1, sorted.length - 1)]! - sorted[lower]!) * fraction;
}

/** Cross-sectional winsorized z-score. Returns null for a constant/empty cross-section. */
export function winsorizedZScores(
  values: readonly (number | null)[],
  lowerQuantile = 0.05,
  upperQuantile = 0.95,
): NullableSeries {
  if (lowerQuantile < 0 || upperQuantile > 1 || lowerQuantile >= upperQuantile) {
    throw new RangeError('invalid winsorization quantiles');
  }
  assertFiniteSeries(values);
  const valid = values.filter((v): v is number => v !== null);
  const out: NullableSeries = Array(values.length).fill(null);
  if (valid.length < 2) return out;
  const low = quantile(valid, lowerQuantile)!;
  const high = quantile(valid, upperQuantile)!;
  const clipped = valid.map(v => Math.min(high, Math.max(low, v)));
  const average = mean(clipped)!;
  const deviation = standardDeviation(clipped)!;
  if (deviation === 0) return out;
  let cursor = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] !== null) out[i] = (clipped[cursor++]! - average) / deviation;
  }
  return out;
}

/** Average-tie ranks normalized to [0, 1]; nulls remain null. */
export function percentileRanks(values: readonly (number | null)[]): NullableSeries {
  assertFiniteSeries(values);
  const valid = values
    .map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => item.value !== null)
    .sort((a, b) => a.value - b.value);
  const out: NullableSeries = Array(values.length).fill(null);
  if (valid.length === 0) return out;
  let i = 0;
  while (i < valid.length) {
    let j = i + 1;
    while (j < valid.length && valid[j]!.value === valid[i]!.value) j += 1;
    const averageRank = (i + j - 1) / 2;
    const percentile = valid.length === 1 ? 0.5 : averageRank / (valid.length - 1);
    for (let k = i; k < j; k += 1) out[valid[k]!.index] = percentile;
    i = j;
  }
  return out;
}

function pearson(x: readonly number[], y: readonly number[]): number | null {
  if (x.length !== y.length || x.length < 2) return null;
  const mx = mean(x)!;
  const my = mean(y)!;
  let numerator = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < x.length; i += 1) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    numerator += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  const denominator = Math.sqrt(sx * sy);
  return denominator === 0 ? null : numerator / denominator;
}

/** Spearman rank information coefficient for paired factor and forward-return samples. */
export function spearmanIC(
  factor: readonly (number | null)[],
  forwardReturns: readonly (number | null)[],
): number | null {
  if (factor.length !== forwardReturns.length) throw new RangeError('paired arrays must have equal length');
  const pairs = factor.flatMap((value, i) => (
    value === null || forwardReturns[i] === null ? [] : [{ x: value, y: forwardReturns[i]! }]
  ));
  if (pairs.length < 3) return null;
  const xRanks = percentileRanks(pairs.map(p => p.x)) as number[];
  const yRanks = percentileRanks(pairs.map(p => p.y)) as number[];
  return pearson(xRanks, yRanks);
}

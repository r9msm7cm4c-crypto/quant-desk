import type { OHLCVBar } from '../types.ts';
import { mean, percentileRanks, standardDeviation, winsorizedZScores } from './statistics.ts';

export interface TechnicalFactors {
  momentum: number | null;
  lowVolatility: number | null;
  volumeSurprise: number | null;
  rangePosition: number | null;
}

/** Point-in-time factor values. Volume baseline excludes the current bar. */
export function technicalFactors(
  bars: readonly OHLCVBar[],
  options: { momentumPeriod?: number; volatilityPeriod?: number; volumePeriod?: number; rangePeriod?: number } = {},
): TechnicalFactors {
  const momentumPeriod = options.momentumPeriod ?? 20;
  const volatilityPeriod = options.volatilityPeriod ?? 20;
  const volumePeriod = options.volumePeriod ?? 20;
  const rangePeriod = options.rangePeriod ?? 20;
  const required = Math.max(momentumPeriod, volatilityPeriod + 1, volumePeriod + 1, rangePeriod);
  if (bars.length <= required) {
    return { momentum: null, lowVolatility: null, volumeSurprise: null, rangePosition: null };
  }
  const last = bars.length - 1;
  const close = bars[last]!.close;
  const momentumBase = bars[last - momentumPeriod]!.close;
  const returns: number[] = [];
  for (let i = last - volatilityPeriod + 1; i <= last; i += 1) {
    const previous = bars[i - 1]!.close;
    const current = bars[i]!.close;
    if (previous <= 0 || current <= 0) throw new RangeError('close must be > 0');
    returns.push(Math.log(current / previous));
  }
  const volumeBaseline = bars.slice(last - volumePeriod, last).map(bar => bar.volume);
  const averageVolume = mean(volumeBaseline);
  const rangeBars = bars.slice(last - rangePeriod + 1, last + 1);
  const highest = Math.max(...rangeBars.map(bar => bar.high));
  const lowest = Math.min(...rangeBars.map(bar => bar.low));
  return {
    momentum: momentumBase <= 0 ? null : close / momentumBase - 1,
    lowVolatility: standardDeviation(returns, true) === null ? null : -standardDeviation(returns, true)!,
    volumeSurprise: averageVolume === null || averageVolume === 0 ? null : bars[last]!.volume / averageVolume - 1,
    rangePosition: highest === lowest ? 0.5 : (close - lowest) / (highest - lowest),
  };
}

export interface FactorObservation {
  symbol: string;
  factors: Record<string, number | null>;
}

export interface CompositeFactorScore {
  symbol: string;
  score: number | null;
  percentile: number | null;
  standardized: Record<string, number | null>;
}

/**
 * Cross-sectional composite score for one timestamp.
 * Weights are signed: positive rewards high raw values; negative rewards low values.
 * Each factor is winsorized and z-scored across the supplied universe.
 */
export function scoreCrossSection(
  observations: readonly FactorObservation[],
  weights: Readonly<Record<string, number>>,
): CompositeFactorScore[] {
  const factorNames = Object.keys(weights);
  if (factorNames.length === 0) throw new RangeError('at least one factor weight is required');
  if (observations.some(row => !row.symbol)) throw new TypeError('every observation needs a symbol');
  const symbols = observations.map(row => row.symbol);
  if (new Set(symbols).size !== symbols.length) throw new RangeError('symbols must be unique');
  for (const weight of Object.values(weights)) {
    if (!Number.isFinite(weight)) throw new TypeError('factor weights must be finite');
  }
  const standardizedByFactor: Record<string, Array<number | null>> = {};
  for (const name of factorNames) {
    standardizedByFactor[name] = winsorizedZScores(observations.map(row => row.factors[name] ?? null));
  }
  const rawScores = observations.map((row, index) => {
    let weighted = 0;
    let totalWeight = 0;
    const standardized: Record<string, number | null> = {};
    for (const name of factorNames) {
      const value = standardizedByFactor[name]![index] ?? null;
      standardized[name] = value;
      if (value !== null && weights[name] !== 0) {
        weighted += value * weights[name]!;
        totalWeight += Math.abs(weights[name]!);
      }
    }
    return { symbol: row.symbol, score: totalWeight === 0 ? null : weighted / totalWeight, standardized };
  });
  const ranks = percentileRanks(rawScores.map(row => row.score));
  return rawScores.map((row, index) => ({
    ...row,
    percentile: ranks[index] ?? null,
  }));
}

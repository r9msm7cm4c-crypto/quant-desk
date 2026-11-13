import { assertFiniteSeries } from '../types.ts';
import { mean, quantile, standardDeviation } from './statistics.ts';

export interface RiskMetrics {
  observations: number;
  cumulativeReturn: number;
  annualizedReturn: number | null;
  annualizedVolatility: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number;
  calmar: number | null;
  historicalVaR: number | null;
  historicalCVaR: number | null;
}

/** Returns are simple period returns expressed as decimals (0.01 = 1%). */
export function calculateRiskMetrics(
  returns: readonly number[],
  options: { periodsPerYear?: number; riskFreeRateAnnual?: number; confidence?: number } = {},
): RiskMetrics {
  assertFiniteSeries(returns);
  const periods = options.periodsPerYear ?? 252;
  const riskFree = options.riskFreeRateAnnual ?? 0;
  const confidence = options.confidence ?? 0.95;
  if (!Number.isFinite(periods) || periods <= 0) throw new RangeError('periodsPerYear must be > 0');
  if (!Number.isFinite(riskFree)) throw new TypeError('riskFreeRateAnnual must be finite');
  if (confidence <= 0 || confidence >= 1) throw new RangeError('confidence must be between 0 and 1');
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of returns) {
    if (value < -1) throw new RangeError('a simple return cannot be below -100%');
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak === 0 ? 0 : (peak - equity) / peak);
  }
  const cumulativeReturn = equity - 1;
  const volatility = standardDeviation(returns, true);
  const annualizedVolatility = volatility === null ? null : volatility * Math.sqrt(periods);
  const annualizedReturn = returns.length === 0 ? null : equity <= 0
    ? -1
    : equity ** (periods / returns.length) - 1;
  const dailyRiskFree = riskFree / periods;
  const excess = returns.map(value => value - dailyRiskFree);
  const excessMean = mean(excess);
  const excessStd = standardDeviation(excess, true);
  const sharpe = excessStd === null || excessStd === 0 || excessMean === null
    ? null : excessMean / excessStd * Math.sqrt(periods);
  const downside = returns.map(value => Math.min(value - dailyRiskFree, 0));
  const downsideDeviation = returns.length < 2 ? null
    : Math.sqrt(downside.reduce((sum, value) => sum + value ** 2, 0) / returns.length);
  const sortino = downsideDeviation === null || downsideDeviation === 0 || excessMean === null
    ? null : excessMean / downsideDeviation * Math.sqrt(periods);
  const returnQuantile = quantile(returns, 1 - confidence);
  const tail = returnQuantile === null ? [] : returns.filter(value => value <= returnQuantile);
  const historicalVaR = returnQuantile === null ? null : Math.max(0, -returnQuantile);
  const historicalCVaR = tail.length === 0 ? null : Math.max(0, -(mean(tail)!));
  return {
    observations: returns.length,
    cumulativeReturn,
    annualizedReturn,
    annualizedVolatility,
    sharpe,
    sortino,
    maxDrawdown,
    calmar: annualizedReturn === null || maxDrawdown === 0 ? null : annualizedReturn / maxDrawdown,
    historicalVaR,
    historicalCVaR,
  };
}

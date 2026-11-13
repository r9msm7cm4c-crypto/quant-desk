import { assertFiniteSeries } from '../types.ts';

export interface TrendForecast {
  observations: number;
  horizon: number;
  lastClose: number;
  forecastClose: number;
  slopePerBar: number;
  rSquared: number | null;
  residualStdError: number | null;
  lower95: number | null;
  upper95: number | null;
}

/**
 * Exploratory log-price linear trend extrapolation.
 * The prediction interval uses a normal 1.96 multiplier and is not a guarantee.
 * Horizon is intentionally capped to reduce misleading long-range extrapolation.
 */
export function linearTrendForecast(
  closes: readonly number[],
  horizon = 1,
  maxHorizon = 5,
): TrendForecast {
  assertFiniteSeries(closes);
  if (closes.length < 5) throw new RangeError('at least 5 closes are required');
  if (closes.some(value => value <= 0)) throw new RangeError('closes must be > 0');
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > maxHorizon) {
    throw new RangeError(`horizon must be an integer from 1 to ${maxHorizon}`);
  }
  const n = closes.length;
  const y = closes.map(Math.log);
  const xMean = (n - 1) / 2;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - xMean;
    const dy = y[i]! - yMean;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const slope = xx === 0 ? 0 : xy / xx;
  const intercept = yMean - slope * xMean;
  const fitted = y.map((_, i) => intercept + slope * i);
  const residuals = y.map((value, i) => value - fitted[i]!);
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const residualStdError = n > 2 ? Math.sqrt(sse / (n - 2)) : null;
  const rSquared = yy === 0 ? null : 1 - sse / yy;
  const targetX = n - 1 + horizon;
  const logForecast = intercept + slope * targetX;
  const forecastClose = Math.exp(logForecast);
  const predictionScale = residualStdError === null ? null
    : residualStdError * Math.sqrt(1 + 1 / n + ((targetX - xMean) ** 2) / xx);
  const lower95 = predictionScale === null ? null : Math.exp(logForecast - 1.96 * predictionScale);
  const upper95 = predictionScale === null ? null : Math.exp(logForecast + 1.96 * predictionScale);
  return {
    observations: n,
    horizon,
    lastClose: closes[n - 1]!,
    forecastClose,
    slopePerBar: slope,
    rSquared,
    residualStdError,
    lower95,
    upper95,
  };
}

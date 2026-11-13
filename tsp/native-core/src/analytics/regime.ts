import type { OHLCVBar } from '../types.ts';
import { adx, realizedVolatility } from '../indicators/advanced.ts';
import { ema } from '../indicators/index.ts';
import { quantile } from './statistics.ts';

export type MarketRegime = 'insufficient' | 'high-volatility' | 'uptrend' | 'downtrend' | 'range';

export interface RegimePoint {
  regime: MarketRegime;
  adx: number | null;
  annualizedVolatility: number | null;
  trendDirection: 'up' | 'down' | 'flat' | null;
}

/**
 * Trailing-only regime classifier. High volatility is defined relative to
 * the preceding volatility observations, not a fixed cross-market threshold.
 */
export function classifyMarketRegime(
  bars: readonly OHLCVBar[],
  options: {
    fastPeriod?: number;
    slowPeriod?: number;
    adxPeriod?: number;
    volatilityPeriod?: number;
    volatilityHistory?: number;
    highVolatilityQuantile?: number;
    adxTrendThreshold?: number;
  } = {},
): RegimePoint[] {
  const fast = options.fastPeriod ?? 20;
  const slow = options.slowPeriod ?? 50;
  const adxPeriod = options.adxPeriod ?? 14;
  const volPeriod = options.volatilityPeriod ?? 20;
  const volHistory = options.volatilityHistory ?? 60;
  const highVolQ = options.highVolatilityQuantile ?? 0.8;
  const adxThreshold = options.adxTrendThreshold ?? 20;
  if (fast >= slow) throw new RangeError('fastPeriod must be smaller than slowPeriod');
  if (highVolQ <= 0 || highVolQ >= 1) throw new RangeError('highVolatilityQuantile must be between 0 and 1');

  const closes = bars.map(bar => bar.close);
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const trend = adx(bars, adxPeriod);
  const vol = realizedVolatility(closes, volPeriod);
  const out: RegimePoint[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const currentVol = vol[i];
    const history = vol.slice(Math.max(0, i - volHistory), i)
      .filter((value): value is number => value !== null);
    const direction = fastEma[i] === null || slowEma[i] === null ? null
      : fastEma[i]! > slowEma[i]! ? 'up'
      : fastEma[i]! < slowEma[i]! ? 'down' : 'flat';
    if (currentVol === null || trend.adx[i] === null || direction === null) {
      out.push({ regime: 'insufficient', adx: trend.adx[i] ?? null, annualizedVolatility: currentVol ?? null, trendDirection: direction });
      continue;
    }
    const volThreshold = history.length >= Math.min(20, volHistory)
      ? quantile(history, highVolQ) : null;
    if (volThreshold !== null && currentVol > volThreshold) {
      out.push({ regime: 'high-volatility', adx: trend.adx[i], annualizedVolatility: currentVol, trendDirection: direction });
    } else if (trend.adx[i]! >= adxThreshold && direction === 'up') {
      out.push({ regime: 'uptrend', adx: trend.adx[i], annualizedVolatility: currentVol, trendDirection: direction });
    } else if (trend.adx[i]! >= adxThreshold && direction === 'down') {
      out.push({ regime: 'downtrend', adx: trend.adx[i], annualizedVolatility: currentVol, trendDirection: direction });
    } else {
      out.push({ regime: 'range', adx: trend.adx[i], annualizedVolatility: currentVol, trendDirection: direction });
    }
  }
  return out;
}

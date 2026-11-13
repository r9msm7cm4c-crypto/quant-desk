import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atr, adx, stochastic, obv, realizedVolatility, donchian,
  winsorizedZScores, percentileRanks, spearmanIC,
  calculateRiskMetrics, linearTrendForecast,
  donchianBreakoutSignals, meanReversionZScores, meanReversionSignals,
  walkForwardSplits, classifyMarketRegime, parseOHLCVCsv, technicalFactors, scoreCrossSection,
  type OHLCVBar,
} from '../src/index.ts';

const sampleBars: OHLCVBar[] = [
  { date: '1', open: 9, high: 10, low: 8, close: 9, volume: 100 },
  { date: '2', open: 9, high: 11, low: 8, close: 10, volume: 120 },
  { date: '3', open: 10, high: 12, low: 9, close: 11, volume: 130 },
  { date: '4', open: 11, high: 13, low: 10, close: 12, volume: 140 },
  { date: '5', open: 12, high: 14, low: 11, close: 13, volume: 150 },
  { date: '6', open: 13, high: 15, low: 12, close: 14, volume: 160 },
  { date: '7', open: 14, high: 16, low: 13, close: 15, volume: 170 },
  { date: '8', open: 15, high: 17, low: 14, close: 16, volume: 180 },
];

test('ATR uses true range and Wilder smoothing', () => {
  const result = atr(sampleBars, 3);
  assert.equal(result[0], null);
  assert.ok(Math.abs(result[2]! - 8 / 3) < 1e-12);
  assert.ok(Math.abs(result[3]! - (8 / 3 * 2 + 3) / 3) < 1e-12);
  assert.throws(() => atr([{ ...sampleBars[0]!, high: 1, low: 2 }], 3), RangeError);
});

test('ADX is bounded and respects warmup alignment', () => {
  const result = adx(sampleBars, 2);
  assert.equal(result.adx[2], null);
  assert.ok(result.adx[3] !== null);
  assert.ok(result.adx[3]! >= 0 && result.adx[3]! <= 100);
  assert.ok(result.plusDi[2]! > result.minusDi[2]!);
});

test('stochastic returns bounded K/D values', () => {
  const result = stochastic(sampleBars, 3, 1, 2);
  assert.equal(result.k[1], null);
  assert.ok(result.k[2]! >= 0 && result.k[2]! <= 100);
  assert.ok(result.d[3]! >= 0 && result.d[3]! <= 100);
});

test('OBV follows close direction and current-bar volume', () => {
  const bars = [sampleBars[0]!, sampleBars[1]!, { ...sampleBars[2]!, close: 9.5 }];
  assert.deepEqual(obv(bars), [0, 120, -10]);
});

test('realized volatility is null until a full return window exists', () => {
  const result = realizedVolatility([100, 101, 102, 101, 104], 3, 252);
  assert.deepEqual(result.slice(0, 3), [null, null, null]);
  assert.ok(result[3]! > 0);
  assert.throws(() => realizedVolatility([100, 0, 101], 2), RangeError);
});

test('Donchian channels and breakout signals do not use current bar in breakout baseline', () => {
  const channel = donchian(sampleBars, 3);
  assert.equal(channel.upper[2], 12);
  const breakoutBars = [
    ...sampleBars.slice(0, 3),
    { date: 'x', open: 12, high: 14, low: 12, close: 13, volume: 10 },
  ];
  assert.deepEqual(donchianBreakoutSignals(breakoutBars, 3), [0, 0, 0, 1]);
});

test('winsorized z-scores clip extremes and percentile ranks handle ties', () => {
  const z = winsorizedZScores([1, 2, 3, 100], 0.25, 0.75);
  assert.ok(z.every(value => value === null || Number.isFinite(value)));
  assert.deepEqual(percentileRanks([10, 20, 20, 30]), [0, 0.5, 0.5, 1]);
  assert.ok(spearmanIC([1, 2, 3, 4], [4, 3, 2, 1])! < -0.99);
});

test('risk metrics are finite and drawdown is measured from prior peak', () => {
  const result = calculateRiskMetrics([0.1, -0.2, 0.05, 0.02]);
  assert.equal(result.observations, 4);
  assert.ok(result.maxDrawdown > 0.1);
  assert.ok(result.historicalVaR !== null);
  assert.ok(result.historicalCVaR !== null);
  assert.throws(() => calculateRiskMetrics([-1.1]), RangeError);
});

test('linear trend forecast provides uncertainty and caps horizon', () => {
  const result = linearTrendForecast([10, 11, 12, 13, 14, 15], 2);
  assert.ok(result.forecastClose > 15);
  assert.ok(result.lower95! < result.forecastClose);
  assert.ok(result.upper95! > result.forecastClose);
  assert.throws(() => linearTrendForecast([10, 11, 12, 13, 14], 6), RangeError);
});

test('mean reversion baseline excludes current observation', () => {
  const z = meanReversionZScores([9, 10, 11, 10, 20], 4);
  assert.ok(z[4]! > 0);
  assert.equal(meanReversionSignals(z, 2)[4], -1);
});

test('walk-forward folds are chronological with embargo gaps', () => {
  const folds = walkForwardSplits(30, 10, 5, { stepSize: 5, embargoBars: 2 });
  assert.deepEqual(folds[0], { trainStart: 0, trainEnd: 10, testStart: 12, testEnd: 17, embargoBars: 2 });
  assert.deepEqual(folds[1], { trainStart: 5, trainEnd: 15, testStart: 17, testEnd: 22, embargoBars: 2 });
  assert.ok(folds.every(fold => fold.trainEnd <= fold.testStart));
});

test('regime classifier emits valid labels and requires warmup', () => {
  const bars = Array.from({ length: 100 }, (_, i) => {
    const close = 100 + i * 0.5 + Math.sin(i / 3);
    return { date: String(i), open: close - 0.2, high: close + 1, low: close - 1, close, volume: 1000 + i };
  });
  const result = classifyMarketRegime(bars, { fastPeriod: 5, slowPeriod: 12, adxPeriod: 5, volatilityPeriod: 5, volatilityHistory: 20 });
  assert.equal(result.length, bars.length);
  assert.equal(result[0]!.regime, 'insufficient');
  assert.ok(['uptrend', 'downtrend', 'range', 'high-volatility', 'insufficient'].includes(result.at(-1)!.regime));
});


test('CSV parser supports Chinese headers, quoted cells and chronological validation', () => {
  const csv = '日期,开盘,最高,最低,收盘,成交量\n2026-01-01,10,11,9,10.5,1,000\n2026-01-02,10.5,12,10,11.5,1,200';
  // The volume values with thousands separators must be quoted in comma-delimited CSV.
  const valid = '日期,开盘,最高,最低,收盘,成交量\n2026-01-01,10,11,9,10.5,"1,000"\n2026-01-02,10.5,12,10,11.5,"1,200"';
  const bars = parseOHLCVCsv(valid);
  assert.equal(bars.length, 2);
  assert.equal(bars[0]!.volume, 1000);
  assert.throws(() => parseOHLCVCsv(csv), RangeError);
  assert.throws(() => parseOHLCVCsv('date,open,high,low,close,volume\n2026-01-02,1,2,0,1,100\n2026-01-01,1,2,0,1,100'), RangeError);
});

test('technical factors use prior-volume baseline and score cross-section', () => {
  const bars = Array.from({ length: 30 }, (_, i) => {
    const close = 20 + i * 0.2;
    return { date: String(i), open: close - 0.1, high: close + 0.5, low: close - 0.5, close, volume: i === 29 ? 300 : 100 };
  });
  const factors = technicalFactors(bars, { momentumPeriod: 5, volatilityPeriod: 5, volumePeriod: 5, rangePeriod: 5 });
  assert.ok(factors.momentum! > 0);
  assert.equal(factors.volumeSurprise, 2);
  const scores = scoreCrossSection([
    { symbol: 'A', factors: { momentum: 0.2, volatility: 0.01 } },
    { symbol: 'B', factors: { momentum: 0.1, volatility: 0.03 } },
    { symbol: 'C', factors: { momentum: -0.1, volatility: 0.02 } },
  ], { momentum: 1, volatility: -1 });
  assert.equal(scores.length, 3);
  assert.ok(scores.every(row => row.score !== null && row.percentile !== null));
});

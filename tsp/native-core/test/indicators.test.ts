import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, macd, bollinger, highest, lowest } from '../src/index.ts';

test('SMA seeds at period - 1', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('EMA uses SMA seed and recursive smoothing', () => {
  const result = ema([1, 2, 3, 4, 5], 3);
  assert.deepEqual(result.slice(0, 3), [null, null, 2]);
  assert.equal(result[3], 3);
  assert.equal(result[4], 4);
});

test('RSI first value is at index period and flat/up-only data returns 100', () => {
  assert.deepEqual(rsi([1, 2, 3, 4, 5], 2).slice(0, 2), [null, null]);
  assert.deepEqual(rsi([1, 2, 3, 4, 5], 2).slice(2), [100, 100, 100]);
});

test('MACD aligns output arrays and rejects invalid fast/slow ordering', () => {
  const values = Array.from({ length: 80 }, (_, i) => 100 + i * 0.5 + Math.sin(i));
  const result = macd(values, 5, 12, 4);
  assert.equal(result.dif.length, values.length);
  assert.equal(result.dea.length, values.length);
  assert.equal(result.hist.length, values.length);
  assert.throws(() => macd(values, 12, 5, 4), RangeError);
});

test('Bollinger bands are symmetric around SMA', () => {
  const result = bollinger([1, 2, 3, 4, 5], 3, 2);
  assert.equal(result.mid[2], 2);
  assert.ok(result.upper[2]! > result.mid[2]!);
  assert.ok(result.lower[2]! < result.mid[2]!);
});

test('rolling high/low use the trailing window', () => {
  assert.deepEqual(highest([3, 1, 5, 2], 2), [null, 3, 5, 5]);
  assert.deepEqual(lowest([3, 1, 5, 2], 2), [null, 1, 1, 2]);
});

test('input validation rejects NaN and invalid periods', () => {
  assert.throws(() => sma([1, Number.NaN], 2), TypeError);
  assert.throws(() => ema([1, 2], Number.POSITIVE_INFINITY), TypeError);
});

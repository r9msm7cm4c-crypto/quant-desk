/** Shared, platform-neutral market data contracts. No browser or server globals. */
export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number | null;
}

export type NullableSeries = Array<number | null>;

export function assertFiniteSeries(values: readonly (number | null)[], label = 'series'): void {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value !== null && !Number.isFinite(value)) {
      throw new TypeError(`${label}[${i}] must be finite or null`);
    }
  }
}

export function assertPeriod(period: number, min = 1): number {
  if (!Number.isFinite(period)) throw new TypeError('period must be finite');
  return Math.max(min, Math.round(period));
}

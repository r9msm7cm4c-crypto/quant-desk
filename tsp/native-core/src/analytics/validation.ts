export interface WalkForwardFold {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  embargoBars: number;
}

/**
 * Expanding/rolling chronological walk-forward folds.
 * All ranges are half-open [start, end). Embargo bars are excluded between
 * the training window and test window to reduce adjacent-label contamination.
 */
export function walkForwardSplits(
  observations: number,
  trainSize: number,
  testSize: number,
  options: { stepSize?: number; embargoBars?: number; expanding?: boolean } = {},
): WalkForwardFold[] {
  const step = options.stepSize ?? testSize;
  const embargo = options.embargoBars ?? 0;
  const expanding = options.expanding ?? false;
  for (const [name, value] of Object.entries({ observations, trainSize, testSize, stepSize: step, embargoBars: embargo })) {
    if (!Number.isInteger(value) || value < (name === 'embargoBars' ? 0 : 1)) {
      throw new RangeError(`${name} must be a valid integer`);
    }
  }
  const folds: WalkForwardFold[] = [];
  for (let trainStart = 0; ; trainStart += step) {
    const trainEnd = expanding ? trainStart + trainSize : trainStart + trainSize;
    const testStart = trainEnd + embargo;
    const testEnd = testStart + testSize;
    if (testEnd > observations) break;
    folds.push({
      trainStart: expanding ? 0 : trainStart,
      trainEnd,
      testStart,
      testEnd,
      embargoBars: embargo,
    });
  }
  return folds;
}

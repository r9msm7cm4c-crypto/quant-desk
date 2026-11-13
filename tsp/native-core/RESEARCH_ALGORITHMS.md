# Quant Desk — Research Algorithms & Method Notes

Status: Phase 2 implementation slice  
Scope: platform-neutral TypeScript calculations in `native-core/`

## Implemented methods

### Technical indicators
- ATR (Wilder smoothing): true range includes the first bar's high-low range; first ATR is seeded with an arithmetic mean over `period` true-range observations.
- ADX / +DI / -DI: directional movement and Wilder smoothing; ADX is trend-strength magnitude, not a directional forecast.
- Stochastic %K / %D: close position in the trailing high-low range, with configurable smoothing.
- OBV: starts at zero and adds/subtracts current-bar volume according to close-to-close direction.
- Annualized realized volatility: sample standard deviation of trailing log returns multiplied by `sqrt(periodsPerYear)`.
- Donchian channels: trailing high/low envelope.

### Factor research
- Momentum: trailing close-to-close price change.
- Low-volatility factor: negative sample standard deviation of trailing log returns.
- Volume surprise: current volume divided by the average of the preceding window, minus one. The current bar is excluded from the baseline.
- Range position: current close position within the trailing high-low range.
- Cross-sectional composite: winsorized z-scores, signed weights, and percentile ranks. Scores are relative to the supplied universe and timestamp; they are not absolute return forecasts.
- Spearman rank IC: association between factor ranks and supplied forward-return ranks. Forward returns must be computed by the caller with a strictly future label window and aligned to the factor timestamp.

### Risk and validation
- Cumulative and annualized return, annualized volatility, Sharpe, Sortino, maximum drawdown, Calmar, historical VaR and CVaR.
- Chronological walk-forward splits with optional embargo bars.
- Mean-reversion z-scores compare the current observation against the preceding window; the current observation is excluded from the baseline.
- Donchian breakout signals compare the current close against the prior completed lookback window; the current bar is excluded from the breakout threshold.
- Trailing market-regime classification combines EMA direction, ADX strength, and a high-volatility threshold estimated from prior volatility observations only.

### Exploratory trend extrapolation
- Log-price ordinary least-squares trend extrapolation for a maximum short horizon (default 5 bars).
- Reports R-squared and a normal-approximation prediction interval based on residual standard error.
- This is an exploratory baseline, not a calibrated probability model. It can fail during structural breaks, regime shifts, corporate actions, bad data, or non-linear price paths.

## Data contract and assumptions
- OHLC prices must be finite and positive; high >= max(open, close), low <= min(open, close), and high >= low.
- Volume must be finite and non-negative.
- CSV dates must be strictly ascending and unique. Importer rejects inconsistent row widths rather than silently shifting columns.
- The parser accepts common Chinese and English OHLCV column labels and comma/tab/semicolon delimiters.
- Calculations use the supplied prices as-is. They do not infer or repair split/dividend adjustments. Data source, adjustment mode, timezone, missing sessions, and stale-data status must be surfaced by the data layer before these calculations are used in production.
- These algorithms do not execute orders and do not produce personalized investment recommendations.

## Numerical parity and validation requirements
Before replacing any existing PWA or Python implementation:
1. Capture deterministic fixtures from the old implementation.
2. Record exact warm-up index, smoothing, sample/population variance, missing-data, and tie-handling semantics.
3. Compare each output with an accepted reference implementation and the existing implementation using documented tolerances.
4. Add property tests for bounds, monotonicity, constant series, missing values, invalid OHLC, and extreme values.
5. Run walk-forward tests and a look-ahead audit; do not use random row splits for time-series labels.
6. Include fees, slippage, lot-size, corporate-action adjustment, and market-session assumptions in any future strategy backtest.

## External research references (method inspiration only; no source code copied)
- `https://github.com/debut-js/Indicators` — streaming indicator design and cross-SDK numeric validation approach (GPL-3.0; not added as a dependency).
- `https://github.com/cinar/indicatorts` — TypeScript indicator and backtesting catalogue (not added as a dependency).
- `https://github.com/POC-2025/freqtrade/blob/main/docs/lookahead-analysis.md` — look-ahead bias analysis concept.
- `https://github.com/eslazarev/purged-cross-validation` — chronological, purged and embargo validation concepts.

No third-party implementation code was copied into this package. External references are listed for engineering context only.

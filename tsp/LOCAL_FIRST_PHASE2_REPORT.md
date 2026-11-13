# Quant Desk — Phase 2 Optimization & Algorithm Expansion Report

> **⚠️ 历史文档，不是阶段 2 的执行记录**
>
> 本文件随原始上传包提供，描述的是上一轮「native-core 算法扩展 + quant-lab 页面」的增量，
> 与《阶段 2 Local-first 迁移》是两件不同的事，**不得作为阶段 2 已完成或进行中的证明**。
>
> 阶段 2 的真实状态以此为准：
>
> ```
> PHASE_2_STATUS = NOT_STARTED
> MIGRATED_PAGES = 0/22
> LOCAL_DATABASE = NOT_IMPLEMENTED
> ```
>
> 进度账本见 `tsp/LOCAL_FIRST_PAGE_MIGRATION_MATRIX.md`。

Date: 2026-11-13  
Baseline: uploaded `quant-desk-local-first-phase1.zip` and its embedded original backup  
Additional user-provided reference: `frontend/src/custom/README.md`

## Summary

This phase adds a platform-neutral research calculation layer and a new source-level frontend extension named `official.quant-lab`. The new research page imports OHLCV CSV data and calculates locally in the browser; it does not call a Quant Desk-owned API for those calculations.

The extension follows the uploaded extension convention:
- `frontend/src/custom/quant-lab/extension.tsx`
- `frontend/src/custom/quant-lab/Page.tsx`
- lazy-loaded route and navigation registration
- no direct edits to the core route table

## Code changes

### New native-core modules
- `indicators/advanced.ts`: True Range, Wilder ATR, ADX/+DI/-DI, Stochastic %K/%D, OBV, annualized realized volatility, Donchian channels.
- `analytics/statistics.ts`: mean, standard deviation, interpolated quantile, winsorized z-score, percentile ranks with average ties, Spearman rank IC.
- `analytics/factors.ts`: momentum, low-volatility, volume-surprise and range-position factors; weighted cross-sectional composite score.
- `analytics/risk.ts`: cumulative/annualized return, volatility, Sharpe, Sortino, max drawdown, Calmar, historical VaR/CVaR.
- `analytics/forecast.ts`: short-horizon log-price linear trend extrapolation with R-squared and approximate prediction interval.
- `analytics/signals.ts`: prior-window Donchian breakout event and mean-reversion z-score/event calculations.
- `analytics/regime.ts`: trailing-only market regime classification using EMA direction, ADX and relative volatility.
- `analytics/validation.ts`: chronological walk-forward folds with optional embargo.
- `analytics/csv.ts`: strict Chinese/English OHLCV CSV parser.

### New frontend extension
- Added `frontend/src/custom/quant-lab/`.
- Registers `/quant-lab` and “量化研究实验室” through the extension registry.
- Imports local CSV up to 20 MB, requires at least 50 rows for the full default regime view, and calculates without API calls.
- Shows explicit error states and research caveats.
- Updated `frontend/src/custom/README.md` to list the new official extension.

### Bug fixes
- PWA service worker previously deleted every cache on the same origin except its own. It now only deletes old caches with the `quantdesk-lab-` namespace and scopes asset lookups to its own cache.
- API request timeout previously cleared after response headers arrived, leaving JSON/blob body consumption outside the timeout window. The timeout now remains active until the body has been consumed or an error has been raised. Header merging now uses the `Headers` API so `Headers`, tuple arrays, and plain objects are handled consistently.

## Tests run

Command:
```bash
cd tsp/native-core && npm test
```

Result: **21 tests passed, 0 failed**.

The suite covers:
- original SMA/EMA/RSI/MACD/Bollinger/high-low semantics;
- ATR and ADX warm-up/alignment and value bounds;
- Stochastic bounds and smoothing;
- OBV direction;
- realized-volatility warm-up and invalid prices;
- Donchian breakout excluding the current bar from its baseline;
- cross-sectional ranks and Spearman IC;
- risk metrics and drawdown;
- forecast interval and horizon guard;
- mean-reversion baseline exclusion;
- chronological walk-forward folds and embargo;
- regime output shape;
- Chinese CSV parsing, malformed rows, and chronological validation;
- technical factor and cross-sectional score output.

Additional syntax check:
```bash
node --check sw.js
```
Result: passed.

## Not yet verified

- Full frontend TypeScript/Vite production build: not run; frontend dependencies are not installed in this environment.
- React extension runtime integration in a browser or iOS simulator: not run.
- Backend Python test suite: not run.
- Native iOS project generation, Xcode build, IPA, signing, or device installation: not run.
- Full TSP Python strategy/factor/backtest feature parity: not complete.
- SQLite persistence, Keychain integration and data migrations: not complete.
- Full local-first replacement of FastAPI calls across the main React app: not complete.

## Important correctness boundaries

- The new factor and forecast methods are research baselines, not validated return predictors.
- The trend prediction interval uses a normal approximation and is not a calibrated probability guarantee.
- Cross-sectional factor scores are only meaningful when observations share the same timestamp and comparable universe.
- Rank IC requires forward-return labels aligned to the factor timestamp. The caller must ensure the labels use only future returns.
- The new single-symbol Quant Lab view computes local statistics from imported OHLCV only. It does not prove a strategy has positive expected return.
- Corporate actions, adjustment modes, exchange calendars, survivorship bias, delisted symbols, missing bars, fees, slippage and A-share trading constraints must be handled before any production-grade backtest claims.
- No brokerage connection or real-money order execution was added.

## Recommended next phase

1. Build golden fixtures from the original PWA's six strategies and backtest engine.
2. Port the six PWA strategies and the single-symbol backtest to native-core with fee/slippage/T+1 assumptions explicitly tested.
3. Add SQLite repositories and schema migrations.
4. Migrate the React pages from required FastAPI calls to local domain services one vertical slice at a time.
5. Add a multi-symbol factor research screen using same-date cross-sectional snapshots and out-of-sample IC/ICIR reports.
6. Only then proceed to a full Capacitor/iOS integration test and IPA release build.

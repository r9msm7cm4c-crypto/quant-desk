# Quant Desk Local-first — Phase 1 Engineering Report

Date: 2026-11-13  
Input: `quant-desk-ui-redesign.zip` supplied in this conversation  
Status: **Architecture and calculation-core foundation added; not a completed iOS app**

## Repository findings

- The upload contains two products: a single-file offline PWA and the larger TSP React + FastAPI product.
- The backend inventory contains 292 Python files. The API folder contains 394 route decorators across 40 modules; these are source decorators, not necessarily 394 unique public endpoints.
- The backend uses a server-oriented numerical/data stack (including Polars, DuckDB, PyArrow, Numba and FastAPI). It cannot be treated as an iOS-compatible binary dependency bundle.
- The PWA already provides a local baseline: localStorage, public data adapters, CSV import/export, six strategies, single-symbol backtesting and a five-step research workflow. It is not feature-equivalent to the full TSP main product.
- The main React frontend still centralizes network calls through `tsp/frontend/src/lib/api.ts` and relies on FastAPI. This has not yet been replaced.

## Changes made in this phase

1. Added `tsp/LOCAL_FIRST_ARCHITECTURE.md` describing the no-server target, boundaries, data/security policy, platform limits and migration sequence.
2. Added `tsp/LOCAL_FIRST_MIGRATION_MATRIX.md` mapping current PWA capability vs TSP capability and local migration status.
3. Added `tsp/native-core/` as a platform-neutral TypeScript calculation package.
4. Implemented PWA-compatible SMA, EMA, RSI, MACD, Bollinger, rolling high and rolling low functions, with input validation.
5. Added `tsp/native-core/test/indicators.test.ts`.
6. Added `tsp/mobile/` Capacitor 8 shell configuration. It bundles frontend assets and deliberately has no remote `server.url`.

## Tests actually run

Command:

```bash
cd tsp/native-core && npm test
```

Result: **7 tests passed, 0 failed**. These cover indicator seeding/alignment, rolling windows, parameter validation and basic Bollinger behavior.

## Not run / not complete

- No frontend production build: frontend dependencies are not installed in this environment (`pnpm` is unavailable).
- No Capacitor dependency installation or `cap sync`.
- No iOS project generation, Xcode build, simulator test, device test, signing, or IPA.
- No SQLite adapter or Keychain adapter yet.
- No FastAPI-to-local-service replacement yet.
- No numerical parity suite for TSP Python backtest/factor/risk modules yet.

## Critical risks retained in the plan

- Full TSP feature parity requires a major rewrite of the Python business logic, not just a Capacitor wrapper.
- Cloud AI is not offline-local; full offline AI requires an on-device model. Optional direct external AI calls would still require internet and user-managed credentials.
- iOS does not guarantee continuous background execution. Always-on monitoring needs a foreground-first redesign and limited local notification scheduling.
- Fresh market quotes require internet; cached data and local calculations can remain available offline.

## Next engineering slice

The next slice should establish the local persistence/repository interfaces and golden fixtures for the PWA's six strategies and backtest engine. Only after those tests pass should the UI's API calls be redirected from FastAPI to local domain services.

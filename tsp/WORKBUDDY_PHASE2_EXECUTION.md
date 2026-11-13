# WorkBuddy Execution Brief — Quant Desk Phase 2

## Source of truth
Use this ZIP's complete project as the working copy. Read:
- `LOCAL_FIRST_PHASE2_REPORT.md`
- `LOCAL_FIRST_ARCHITECTURE.md`
- `LOCAL_FIRST_MIGRATION_MATRIX.md`
- `native-core/RESEARCH_ALGORITHMS.md`
- `frontend/src/custom/README.md`

Do not overwrite the original project backup. Keep a clean working branch/copy and make incremental commits or backups before risky changes.

## Phase 2 verification tasks
1. Install the exact frontend dependencies from the existing lockfile; do not casually upgrade React, Vite, Capacitor or TypeScript.
2. Run `cd native-core && npm test`.
3. Run the frontend TypeScript/Vite production build.
4. Resolve any errors introduced by `frontend/src/custom/quant-lab` and verify Vite can resolve the shared `native-core` import.
5. Launch the app and verify `/quant-lab` is registered through the extension system. The extension may be hidden by default; enable it in Settings → Menu Settings.
6. Test CSV imports: Chinese/English headers, quoted thousand separators, empty rows, malformed rows, non-ascending dates, duplicate dates, invalid OHLC, zero/negative prices, negative volume, and files over 20 MB.
7. Verify the Quant Lab page does not issue `/api/*` requests when parsing or calculating imported data.
8. Verify PWA service-worker activation only removes `quantdesk-lab-*` caches and never deletes unrelated origin caches.
9. Verify API request timeout remains active while consuming JSON/blob response bodies.

## Non-negotiable engineering rules
- Do not claim the full application is serverless yet. The new Quant Lab page's calculations are local; many existing main-app pages still depend on FastAPI.
- Do not remove existing pages or strategies to make a build pass.
- Do not silently change old PWA indicator semantics. Add golden fixtures and explicit migration notes first.
- Never use current/future bars to calculate a past signal. Add look-ahead tests.
- No real-money order execution, brokerage integration or personalized stock recommendations.
- Show data source, adjustment mode, timestamp, missing-data status and stale-data status when the data layer is connected.
- Keep forecast outputs labelled as exploratory estimates with uncertainty, not guaranteed predictions.
- Keep all algorithm calculations in `native-core`; UI should only parse user input, call domain functions and render results.

## Next implementation slice
After build and runtime verification:
1. Add golden fixtures for the original six PWA strategies and single-symbol backtest.
2. Port those six strategies and backtest engine into `native-core`.
3. Match the old semantics for fees, slippage, T+1, lot size, stop/target ordering and unclosed-position valuation.
4. Add SQLite repository interfaces and migrations.
5. Replace FastAPI dependencies one feature vertical-slice at a time.
6. Run offline tests and numerical parity tests before generating an IPA.

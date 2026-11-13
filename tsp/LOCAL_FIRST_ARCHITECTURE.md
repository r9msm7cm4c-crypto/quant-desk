# Quant Desk — Local-first Architecture Decision

Status: **Accepted direction; implementation in progress**  
Date: 2026-11-13

## Product requirement

The iOS app must start and perform its core research calculations without a Quant Desk-owned server. A network connection may be used to fetch public market data or optional user-authorized external services, but it must not be required to open the app, inspect cached data, calculate indicators, run supported backtests, or manage local research records.

## What the uploaded repository actually contains

The repository is not a single web app. It contains:

1. A single-file offline PWA (`index.html`) with localStorage persistence, public quote/data adapters, six built-in strategy definitions, a single-symbol backtest engine, parameter optimization, CSV import/export, and a five-stage research workflow.
2. A much larger TSP main application (`tsp/`) with React frontend and a Python/FastAPI backend. The backend tree contains 292 Python files and the API directory contains 394 route decorators across 40 modules. These counts are source inventory counts, not a claim of 394 unique public contracts.
3. The main backend depends on server-oriented and native-heavy Python packages including Polars, DuckDB, PyArrow, Numba, APScheduler, FastAPI, and provider SDKs. These are not a drop-in iOS runtime.

The README's offline PWA is already local-first, but it is not feature-equivalent to the full TSP main application. The complete TSP feature set cannot be honestly preserved by merely wrapping the PWA.

## Target architecture

```text
Capacitor iOS shell (bundled WKWebView; no server.url)
  ├── React presentation layer (shared desktop/mobile UI where appropriate)
  ├── Domain services (pure TypeScript; no browser, HTTP, or storage globals)
  │    ├── market-data normalization
  │    ├── indicators and signal calculations
  │    ├── strategy registry and evaluation
  │    ├── backtest / portfolio / risk engines
  │    ├── factors / screening / regime calculations
  │    └── validation and provenance
  ├── Repository interfaces
  │    ├── MarketDataRepository
  │    ├── StrategyRepository
  │    ├── BacktestRepository
  │    └── SettingsRepository
  ├── Persistence adapters
  │    ├── SQLite: bars, factors, backtests, research records
  │    ├── Keychain: credentials and encryption keys
  │    └── Filesystem: user exports and import staging
  ├── Optional network adapters
  │    └── public market data / user-selected external providers
  └── Native capabilities
       ├── file picker / share sheet
       ├── network status
       ├── local notifications (not continuous background scanning)
       └── app lifecycle / safe-area integration
```

## Hard constraints and product truth

- **No self-hosted backend:** the app cannot call required `/api/*` endpoints. Every required domain operation must be ported to local TypeScript or a supported on-device native implementation.
- **No automatic Python embedding assumption:** Polars/Numba/PyArrow/DuckDB server dependencies are not assumed to run on iOS. Their business semantics must be ported and parity-tested; a native SQLite implementation may replace data storage, not analytical semantics.
- **Internet is optional, not forbidden:** public market data refresh needs a network. Offline mode means cached data and local calculations remain available; it does not mean fresh quotes appear without connectivity.
- **AI is a separate capability:** cloud AI cannot be described as fully local. Full offline AI requires an on-device model and its own memory, privacy, latency, and package-size evaluation. Until then, AI-dependent features must be labelled optional/unavailable offline rather than silently removed.
- **Background monitoring is constrained by iOS:** continuous, second-by-second background quote polling cannot be promised. Foreground monitoring and scheduled local notifications are possible within OS limits.
- **No order execution:** this app remains a research/analysis tool; this migration does not add real-money trading or brokerage execution.

## Data and security policy

- Store market bars and analytical outputs in SQLite with schema versioning and migrations.
- Use a bounded cache policy and expose storage usage / clear-cache controls.
- Keep credentials in Keychain; do not place API secrets in source, URLs, logs, localStorage, or exported diagnostic reports.
- Treat imported CSV/JSON as untrusted input: validate headers, numeric ranges, dates, row counts, and file size before import.
- Attach `source`, `fetchedAt`, `isDemo`, `adjustmentMode`, and coverage metadata to imported/fetched datasets. Never present demo data as live data.
- All calculations must disclose assumptions (fees, slippage, lot size, T+1, missing bars, stop/target ordering, open positions).

## Migration sequence

1. Freeze and inventory the PWA and TSP features; produce a traceable feature-to-local-service matrix.
2. Add Capacitor shell and native app lifecycle, without enabling the current server-dependent UI as a finished app.
3. Establish shared TypeScript domain contracts and golden test fixtures from the existing PWA/Python outputs.
4. Port deterministic calculation engines in vertical slices: indicators → six PWA strategies → single-symbol backtest → optimizer → research/factors/risk → TSP-specific engines.
5. Introduce SQLite repositories and data migrations; make all reads/writes go through repository interfaces.
6. Replace FastAPI calls by local services or explicit optional providers; remove required API coupling route by route.
7. Reconcile feature parity and document unavoidable iOS limits (AI model availability, background tasks, provider licensing/rate limits).
8. Run offline, persistence, numerical parity, memory, and iPhone viewport tests before Release/IPA.

## Current implementation in this package

- `native-core/` begins the platform-neutral calculation layer with PWA-compatible SMA, EMA, RSI, MACD, Bollinger, rolling high/low functions and Node test coverage.
- `mobile/` contains a Capacitor 8 shell configuration with bundled assets and no remote server URL.
- The main frontend still depends on FastAPI. The shell is scaffolding only and must not be represented as a complete iOS app yet.

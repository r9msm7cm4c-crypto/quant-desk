# Local-first Feature Migration Matrix

Legend: **Existing local** = already in the offline PWA; **Port required** = available in TSP but still server/Python-backed; **iOS constrained** = requires a redesign or cannot be guaranteed by iOS background/runtime rules.

| Feature area | Existing local PWA | TSP main app | Local-first target | Current status |
|---|---|---|---|---|
| Dashboard / market overview | Partial | Full | Local aggregation from cached datasets | Inventory required |
| Market quotes / daily bars | Public endpoints + CSV | Multiple provider adapters and pipelines | Optional direct providers + SQLite cache | Provider audit required |
| Minute / intraday data | Limited | Extensive sync, replay and monitoring | Provider adapter + bounded local cache | Port required |
| Watchlist | Local | Full groups, stats, sync | SQLite repository + import/export | Port required |
| Technical indicators | Local subset | 68-column enriched pipeline | TypeScript deterministic engine | Initial core started |
| Quant Lab research page | No standalone local lab | Multiple server-backed research pages | Local CSV + native-core analytics extension | Phase 2 page added; frontend build pending |
| Built-in strategies | Six | 25+ and extensions | Typed local strategy registry | Port and parity tests required |
| Backtesting | Single-symbol, local | Multi-mode, workers, T+1, fees, slippage, risk | Local TS engine + worker/Web Worker where available | Port required |
| Parameter optimization | Local limited grid | Optimizers / robust workflows | Local bounded compute with cancellation | Port required |
| Factors / factor mining | Five-stage sample research | DSL, materialization, mining and validation | Local factor DSL + bounded search | Major port required |
| Portfolio optimization | Simplified research workflow | Multiple portfolio / position services | Local numerical implementation | Major port required |
| Risk analytics | Backtest metrics subset | Risk, drawdown, guardian and policies | Local risk engine and explicit assumptions | Port required |
| Market regime / sector rotation | Partial research workflow | Full data-driven pipelines | Local calculations on cached data | Port required |
| Financial statements | Not full | Sync + analysis | Download/import/cache with data provenance | Provider/data licensing audit |
| AI assistant / AI reports | No equivalent full local model | Cloud provider integrations | On-device model or clearly optional external service | Not yet solved offline |
| Alerts / monitoring | Limited foreground | Scheduler, SSE, push integrations | Foreground monitoring + scheduled local notifications | iOS background constraints |
| Paper trading | Not equivalent | Paper portfolio / simulation modules | Local simulation only, no order routing | Port required |
| CSV / JSON import/export | Yes | Full import center and backups | Native file picker + validated SQLite import/export | Adapter required |
| Settings / credentials | Local settings | Capability and provider settings | SQLite settings + Keychain secrets | Adapter required |
| MCP / open API / server administration | No | Yes | Not part of standalone local app; consider local-only export protocol | Explicit product decision required |

## Parity gate

A feature is not “preserved” until it has:

1. a named local service and repository contract;
2. a deterministic fixture from the old implementation;
3. numerical/behavioral parity tests or a documented, user-approved semantic change;
4. an offline test proving no required network request;
5. a UI state for missing/stale/demo data and computation errors.

## Known incompatibilities to resolve before claiming 100% parity

- The TSP backend has a large Python-specific numerical and data stack. Rewriting it is a major engineering project, not a packaging operation.
- AI features require either an on-device model or a user-approved external AI provider; external AI is not offline-local.
- iOS does not guarantee continuous background execution. Always-on monitor behavior must be redesigned and disclosed.
- Server-specific capabilities (MCP server, public REST API, admin pages, multi-user auth) have no direct meaning in a single-user standalone iPhone app and need explicit product decisions.

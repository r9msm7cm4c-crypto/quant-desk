# Quant Desk Native Core

Platform-neutral calculation code for the local-first app. This package must remain free of React, browser globals, network requests, filesystem calls, and platform-specific plugins.

## Current scope

- OHLCV and nullable-series contracts.
- SMA, EMA, RSI, MACD, Bollinger bands, rolling highest/lowest.
- Indicator semantics intentionally follow the existing offline PWA implementation; parity must be expanded with fixtures before replacing any production calculation path.

## Test

Requires Node.js 22.6+ for built-in TypeScript type stripping:

```bash
npm test
```

The Node warning about experimental type stripping is expected in this scaffold. Production frontend/mobile builds will use the repository's TypeScript compiler.

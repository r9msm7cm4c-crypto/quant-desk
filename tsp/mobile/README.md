# Quant Desk Mobile Shell (scaffold only)

This is the Capacitor 8 shell for the future fully local iOS app. It deliberately has **no `server.url`**: production assets must be bundled into the app and the app must not depend on a hosted Quant Desk server.

## Important current limitation

The existing React main site still calls the FastAPI API (`frontend/src/lib/api.ts`). Therefore this shell is **not yet a working offline-native app**. Do not run `cap sync` and treat the resulting IPA as feature-complete. The API-to-local-domain migration and persistence layer must be completed first.

## Setup (macOS)

```bash
npm install
npm run cap:sync
npx cap add ios
npx cap open ios
```

`cap:sync` builds the React frontend and copies the built assets into the native project. Run `npx cap add ios` only once, after dependencies are installed. Commit the generated `ios/` project after reviewing signing and bundle settings.

## Runtime architecture rules

- No remote `server.url`, reverse proxy, or required FastAPI endpoint.
- Core calculations live in `../native-core/` and must be deterministic and testable without network access.
- Market-data providers are optional network adapters; cached data remains readable offline.
- Secrets must be stored in iOS Keychain, never in source code or plain localStorage.
- Background monitoring is best-effort only: iOS suspends apps and does not guarantee continuous execution.


## OTA live updates

This shell includes the Capawesome Live Update integration. Before the first iOS release, WorkBuddy must install dependencies in both `frontend/` and `mobile/`, inject `OTA_PUBLIC_KEY` into the Capacitor build environment, set `VITE_OTA_PUBLIC_KEY_CONFIGURED=true`, and copy `mobile/PrivacyInfo.xcprivacy.template` to `ios/App/App/PrivacyInfo.xcprivacy` (merging the UserDefaults reason if a manifest already exists). See `../OTA_UPDATE_GUIDE.md`. The private signing key must never enter the repository or IPA.

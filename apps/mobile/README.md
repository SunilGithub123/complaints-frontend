# `apps/mobile` — Complaints CRS (React Native + Expo)

Mobile app for consumers (complaint submission, tracking, feedback) and
field staff (technicians + engineers). Lands in the monorepo as part of
Phase 4 of the ROADMAP. Stage 21.3-a is the bare shell — no real screens
yet, just enough to boot and prove the dep chain.

## Stack

| | |
|---|---|
| Runtime | Expo SDK 52 / React Native 0.76 / React 18.3 |
| Language | TypeScript strict (extends repo-root `tsconfig.base.json`) |
| Router | `expo-router` v4 (file-based, typed routes) |
| Server state | `@tanstack/react-query` against `@complaints/api` (shared with web) |
| Client state | `zustand` (lands in 21.3-b with the auth stores) |
| Secure storage | `expo-secure-store` (`deviceId` in 21.3-c per contract §9) |
| Push | `@react-native-firebase/messaging` (raw FCM, **not** Expo Push API — lands in 21.3-c per BE-confirmed transport decision 2026-06-25) |
| i18n | `@complaints/i18n` re-used verbatim |
| UI tokens | `@complaints/ui-tokens` consumed via `StyleSheet` (no CSS-in-JS per copilot-instructions rule #11) |

## Local development

```bash
# Once, after fetching the repo:
pnpm install

# Start Metro (in this dir, or from repo root with --filter mobile):
pnpm --filter mobile start
```

Then in the Metro terminal:

- `i` → boot iOS simulator (requires Xcode)
- `a` → boot Android emulator (requires Android Studio + an AVD)

The bare shell should render the "Stage 21.3-a complete" screen with
the current IST timestamp pulled from `@complaints/utils`.

### Custom dev client

Push notifications and `expo-secure-store` need native modules, so we
target the **dev-client** (not Expo Go). Build it once per platform —
run each command on its own line, no trailing shell comments (pnpm
forwards extra args to the underlying `expo` invocation, so a `# once`
suffix becomes a malformed `expo prebuild --clean '#' once`):

```bash
pnpm --filter mobile prebuild
pnpm --filter mobile ios
# or
pnpm --filter mobile android
```

Subsequent runs only need `pnpm --filter mobile start`.

### API base URL

Defaults to `http://localhost:8080`. Override per-machine in
`apps/mobile/.env.local`:

```
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:8080
```

- iOS simulator can hit `localhost` directly.
- Android emulator needs `10.0.2.2` (or set the LAN IP).
- A physical device needs the host's LAN IP or an Expo tunnel.

CORS is a non-issue on mobile — Expo's native `fetch` sends no `Origin`
header, and the BE's dev profile allows `http://localhost:*` anyway
(confirmed by BE 2026-06-25).

## What's NOT in 21.3-a (lands in 21.3-b / 21.3-c)

- Auth stores (`authStore` / `consumerAuthStore`) — stubbed to `null` in
  `wireApi.ts` for now.
- Real screens (landing, OTP, submit, tracking, detail).
- ESLint config and `jest-expo` test plumbing.
- Push permission UX, FCM token acquisition, `setBackgroundMessageHandler`.
- `expo-secure-store` `deviceId` persistence (mobile twin of
  `@complaints/utils#getOrCreateDeviceId`).

See `docs/IMPLEMENTATION_LOG.md` Stage 21.3-a entry for the full carry-over list.


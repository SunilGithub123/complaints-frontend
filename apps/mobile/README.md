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
| Client state | `zustand` (auth stores live in `src/auth/` as of 21.3-b.1) |
| Forms | `react-hook-form` + `zod` via `@hookform/resolvers/zod` (as of 21.3-b.2) |
| Routing | `expo-router` v4 file-based; `(auth)` route group hosts the unauthenticated stack, `(consumer)` hosts landing → OTP → submit → submitted |
| Photos | `expo-image-picker` + `expo-image-manipulator` (0..3 per complaint, ≤ 1 MB post-compression) — 21.3-b.3-b-2 |
| Secure storage | `expo-secure-store` (`deviceId` in 21.3-c per contract §9) |
| Push | `@react-native-firebase/messaging` (raw FCM, **not** Expo Push API — per BE-confirmed transport decision 2026-06-25). Foundation (`deviceId`, `PushProvider` Strategy, register-retry-once, `revokeStaff`) shipped in 21.3-c.1 with a stub provider. Real FCM transport shipped in 21.3-c.2-a behind `EXPO_PUBLIC_ENABLE_PUSH=true` — see `credentials/README.md` for setup. |
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

## What's NOT in 21.3-d (Stage 21 mobile bracket closed; carry-overs post-21)

- **Real Firebase credentials** — gated on user supplying
  `google-services.json` / `GoogleService-Info.plist` per
  `credentials/README.md`. Required to run the Stage 21.2 payload
  smoke end-to-end.
- **Local-notification banner display** for foreground / background
  frames via `expo-notifications` — polish; payload is received
  regardless.
- **Real staff/consumer complaint-detail routes** for
  `pushRouteMap.ts`'s two `TODO` pathnames — post-21 mobile
  roadmap; only the constants change.
- **MSW dev mode** — parked.
- **Locale selector UI**, **camera-capture button**, **confirmation
  polish (share/copy/refresh)** — polish.

See `docs/IMPLEMENTATION_LOG.md` Stage 21.3-d entry for the full
carry-over list and the Stage 21 contract-conformance table.


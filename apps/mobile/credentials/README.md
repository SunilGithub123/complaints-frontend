# Firebase Credentials (`apps/mobile/credentials/`)

This directory documents where to place the **Firebase Cloud Messaging**
credentials used by `@react-native-firebase/app` for the mobile push
transport. Real credential files themselves are `.gitignore`d — they
must never be committed.

## Files needed

| Platform | Filename                     | Placement                                         |
|----------|------------------------------|---------------------------------------------------|
| Android  | `google-services.json`       | `apps/mobile/google-services.json` (project root) |
| iOS      | `GoogleService-Info.plist`   | `apps/mobile/GoogleService-Info.plist`            |

`apps/mobile/app.json` references both via `expo.android.googleServicesFile`
and `expo.ios.googleServicesFile`. The `@react-native-firebase/app` config
plugin copies them into the generated native projects during `expo prebuild`.

## How to obtain

1. Go to the Firebase console → project **`crs-complaints-<env>`**.
2. **Android app** → *Package name* `com.crs.complaints` → download
   `google-services.json`.
3. **iOS app** → *Bundle ID* `com.crs.complaints` → download
   `GoogleService-Info.plist`.
4. Drop both files at the paths in the table above.

## Enable the push transport

By default `fcmPushProvider` is **not** swapped in — the app runs
against the stub provider that hands out `stub-token-<platform>`. To
switch to real FCM:

```bash
# apps/mobile/.env.local (per-machine, gitignored)
EXPO_PUBLIC_ENABLE_PUSH=true
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:8080   # your dev BE
```

Then regenerate the native projects so the Firebase plugin's edits
land in `ios/` and `android/`:

```bash
pnpm --filter mobile prebuild
pnpm --filter mobile ios       # or `android`
```

`wirePushProvider()` reads `EXPO_PUBLIC_ENABLE_PUSH` at boot and does
a dynamic `import('./fcmPushProvider')` only when it's set — dev builds
without credentials keep working against the stub with zero warnings.

## Sanity checks

- `apps/mobile/google-services.json` present? → Android build resolves
  Firebase.
- `apps/mobile/GoogleService-Info.plist` present? → iOS build resolves
  Firebase.
- `EXPO_PUBLIC_ENABLE_PUSH=true` in your env? → boot swaps to the real
  provider.
- On device, first cold-launch → check `messaging().getToken()` returns
  a non-empty FCM token. On iOS the OS-level notifications permission
  prompt fires the first time a `registerConsumer()` /
  `registerStaff()` call runs (post-submit / post-login trigger,
  Stage 21.3-c.2-b).

## What lives in this directory today

Just this README. Real credential files are `.gitignore`d at the mobile
project root (`google-services.json` + `GoogleService-Info.plist`
patterns). Add sanitised **placeholder** JSON / plist stubs alongside
this file if you want a "look, this is the shape" reference — they're
not read by the plugin (plugin reads from the paths listed above).


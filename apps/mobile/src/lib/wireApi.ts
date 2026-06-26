/**
 * Wires `@complaints/api`'s framework-free transport for the mobile app.
 * Mobile equivalent of `apps/web/src/auth/wireApi.ts`.
 *
 * Stage 21.3-b.1 — the staff `authStore` and ephemeral
 * `consumerAuthStore` are live; this file pulls tokens straight from
 * them on every transport call. `setAuthHooks` reads getters at call
 * time (not at wire time), so stale closures are not a concern.
 *
 * **Async rehydration caveat**: both stores persist to
 * `expo-secure-store`, which is async. There is a small window at app
 * boot where `getState()` returns default `null` values before
 * rehydration completes. The first authenticated request only fires
 * after user interaction, by which time rehydration is done. If a
 * future deep-link route ever needs the token before the first paint,
 * gate the root layout on `useAuthStore.persist.hasHydrated()`.
 *
 * `baseUrl` resolution:
 * - Reads `EXPO_PUBLIC_API_BASE_URL` from the Expo env if set.
 * - Falls back to `http://localhost:8080` for dev. iOS simulator can
 *   hit `localhost` directly; Android emulator needs `10.0.2.2`; a
 *   physical device on the same WiFi needs the host LAN IP or an
 *   Expo tunnel. Set `EXPO_PUBLIC_API_BASE_URL` in `.env.local` to
 *   override.
 *
 * CORS is a non-issue on mobile per BE confirmation 2026-06-25 — Expo's
 * native fetch sends no `Origin` header, and the BE's dev profile allows
 * `http://localhost:*` anyway.
 */
import { setAuthHooks } from '@complaints/api';

import { useAuthStore } from '@/auth/authStore';
import {
  useConsumerAuthStore,
  selectConsumerToken,
} from '@/auth/consumerAuthStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

export function wireApi(): void {
  setAuthHooks({
    baseUrl: API_BASE_URL,
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    // Consumer endpoints (`/api/v1/consumer/**`) get the 5-min verify
    // JWT. The selector returns null automatically once the token has
    // expired, so the BE gets no header rather than a known-bad Bearer.
    getConsumerToken: () => selectConsumerToken(useConsumerAuthStore.getState()),
    onTokensRefreshed: ({ accessToken, refreshToken }) => {
      useAuthStore.getState().setTokens({ accessToken, refreshToken });
    },
    onUnauthenticated: () => {
      useAuthStore.getState().clear();
      // Navigation side-effect lives with the first guarded screen
      // (lands in Stage 21.3-b.2). Until then a 401 silently clears
      // the session and the user re-authenticates on next interaction.
    },
  });
}


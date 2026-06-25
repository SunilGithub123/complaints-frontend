/**
 * Wires `@complaints/api`'s framework-free transport for the mobile app.
 * Mobile equivalent of `apps/web/src/auth/wireApi.ts`.
 *
 * Stage 21.3-a — auth stores don't exist on mobile yet; every token getter
 * is stubbed to `null`. The bare shell makes no authenticated requests so
 * this is fine. Real stores (`authStore`, `consumerAuthStore`) land in
 * Stage 21.3-b alongside the first auth screen and get wired here at the
 * same time. `setAuthHooks` accepts a partial — calling it again later
 * with the real getters is the supported merge path.
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

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

export function wireApi(): void {
  setAuthHooks({
    baseUrl: API_BASE_URL,
    getAccessToken: () => null,
    getRefreshToken: () => null,
    getConsumerToken: () => null,
    onTokensRefreshed: () => undefined,
    onUnauthenticated: () => undefined,
  });
}


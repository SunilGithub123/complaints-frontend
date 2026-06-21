/**
 * Wires `@complaints/api`'s framework-free transport to the web app's
 * Zustand auth store. Called once at app boot from `main.tsx`. Keeping
 * this glue out of the api package is deliberate: the package must be
 * runnable from Node (for Vitest) and reusable from `apps/mobile`.
 */
import { setAuthHooks } from '@complaints/api';
import { useAuthStore } from '@/auth/authStore';

// The OpenAPI snapshot already embeds the `/api/v1` prefix in every path,
// so generated callsites pass `/api/v1/...` directly. We leave `baseUrl`
// empty in dev (Vite's proxy forwards `/api/*` → http://localhost:8080)
// and in prod (web is served same-origin behind a reverse proxy). Override
// `VITE_API_BASE_URL` only when the API lives on a different origin.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export function wireApi(): void {
  setAuthHooks({
    baseUrl: API_BASE_URL,
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    onTokensRefreshed: ({ accessToken, refreshToken }) => {
      useAuthStore.getState().setTokens({ accessToken, refreshToken });
    },
    onUnauthenticated: () => {
      useAuthStore.getState().clear();
      // Routing side-effect is handled by the `auth:logout` listener installed
      // in `main.tsx`; we just clear store state here.
    },
  });
}


/**
 * Wires `@complaints/api`'s framework-free transport to the web app's
 * Zustand auth store. Called once at app boot from `main.tsx`. Keeping
 * this glue out of the api package is deliberate: the package must be
 * runnable from Node (for Vitest) and reusable from `apps/mobile`.
 */
import { setAuthHooks } from '@complaints/api';
import { useAuthStore } from '@/auth/authStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

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


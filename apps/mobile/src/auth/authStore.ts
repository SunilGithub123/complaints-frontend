/**
 * Mobile staff auth store — twin of `apps/web/src/auth/authStore.ts`.
 *
 * Holds the staff session triple (access JWT, refresh JWT, cached
 * `StaffSummary`) plus a `lastValidatedAt` timestamp for boot-time
 * `/staff/me` revalidation (same contract as the web guard).
 *
 * **Persistence**: `expo-secure-store` via the `secureStorage` adapter.
 * Unlike the web store (which writes synchronously to `localStorage`),
 * SecureStore is async — zustand persist handles that transparently
 * but it means there is a small window at app boot where `getState()`
 * returns the default `null` values before rehydration completes. The
 * generated TanStack Query hooks only fire after user interaction, by
 * which time rehydration is done; we deliberately do not block render
 * on `useAuthStore.persist.hasHydrated()` here — keeps `_layout.tsx`
 * thin. Revisit if a deep-link route ever needs the token before the
 * first paint.
 *
 * Design rules (same as web):
 *  - Selectors only. No thunks / side effects in the store.
 *  - Default zustand `create` — no DevTools middleware (Phase 7).
 *  - Framework-free apart from the zustand React bindings consumers use.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Schemas } from '@complaints/api';

import { secureStorage } from './secureStorage';

type StaffSummary = Schemas.StaffSummaryResponse;

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  staff: StaffSummary | null;
  /**
   * Epoch-ms of the last successful `GET /staff/me` revalidation. `null`
   * after login / change-password / refresh so the boot-time guard fires
   * again. Mirrors the web Stage 8a semantics.
   */
  lastValidatedAt: number | null;
  /** Set the full session triple after a successful login. */
  setSession: (input: {
    accessToken: string;
    refreshToken: string;
    staff: StaffSummary;
  }) => void;
  /** Rotate just the tokens (called by the transport's refresh flow). */
  setTokens: (input: { accessToken: string; refreshToken: string }) => void;
  /** Update the cached staff profile (e.g. after change-password). */
  setStaff: (staff: StaffSummary) => void;
  /** Mark a successful /me round-trip as the source-of-truth snapshot. */
  setValidatedStaff: (staff: StaffSummary) => void;
  /** Wipe everything — used on logout and refresh failure. */
  clear: () => void;
}

// `expo-secure-store` validates keys against `^[\w.-]+$`, which rejects
// the `:` used in the web store's `complaints:auth`. Underscores keep
// the storage namespace recognisable without tripping the validator
// (latent bug caught by the b.3-b-1 test plumbing — would have crashed
// on first staff login on a real device). Mobile and web don't share
// storage so the divergence is safe.
const STORAGE_KEY = 'complaints_auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      staff: null,
      lastValidatedAt: null,
      setSession: ({ accessToken, refreshToken, staff }) =>
        set({ accessToken, refreshToken, staff, lastValidatedAt: null }),
      setTokens: ({ accessToken, refreshToken }) =>
        set({ accessToken, refreshToken, lastValidatedAt: null }),
      setStaff: (staff) => set({ staff }),
      setValidatedStaff: (staff) => set({ staff, lastValidatedAt: Date.now() }),
      clear: () =>
        set({ accessToken: null, refreshToken: null, staff: null, lastValidatedAt: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        staff: s.staff,
      }),
    },
  ),
);

// Stable selectors — components subscribe to slices rather than the whole store.
export const selectAccessToken = (s: AuthState): string | null => s.accessToken;
export const selectRefreshToken = (s: AuthState): string | null => s.refreshToken;
export const selectStaff = (s: AuthState): StaffSummary | null => s.staff;
export const selectIsAuthenticated = (s: AuthState): boolean => s.accessToken !== null;
export const selectLastValidatedAt = (s: AuthState): number | null => s.lastValidatedAt;


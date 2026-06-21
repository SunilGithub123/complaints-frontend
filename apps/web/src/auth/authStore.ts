/**
 * Auth store — the *single* allowed global state slice (per
 * .github/copilot-instructions.md: "Client state → Zustand"). Holds the
 * staff session triple: access JWT, refresh JWT, and the cached `StaffSummary`.
 *
 * Persisted to `localStorage` under `STORAGE_KEY` so a page refresh during
 * the master-data screens does not force a re-login while the token is
 * still valid. The refresh-on-401 dance lives in `@complaints/api`'s
 * transport; we only feed it tokens via `wireApi.ts`.
 *
 * Design rules respected:
 *  - Selectors only. NO thunks / side effects in the store. Mutations are
 *    plain setters; callers compose them with React Query hooks.
 *  - Default Zustand `create` (no Redux DevTools middleware until Phase 7).
 *  - Store stays framework-free; React bindings are via `zustand/react`.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Schemas } from '@complaints/api';

type StaffSummary = Schemas.StaffSummaryResponse;

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  staff: StaffSummary | null;
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
  /** Wipe everything — used on logout and refresh failure. */
  clear: () => void;
}

const STORAGE_KEY = 'complaints:auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      staff: null,
      setSession: ({ accessToken, refreshToken, staff }) =>
        set({ accessToken, refreshToken, staff }),
      setTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),
      setStaff: (staff) => set({ staff }),
      clear: () => set({ accessToken: null, refreshToken: null, staff: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
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


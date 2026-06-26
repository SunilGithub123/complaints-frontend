/**
 * Consumer auth store (mobile) — twin of
 * `apps/web/src/features/consumer/consumerAuthStore.ts`.
 *
 * Holds the 5-minute consumer verify JWT + the identity the consumer
 * typed on the landing screen (consumerId + mobile). Completely
 * separate from the staff `authStore`:
 *
 *  - **Lifetime**: ephemeral. The web flavour uses `sessionStorage` so
 *    state dies on tab close. On mobile the equivalent is "process
 *    death" — Expo / RN does not give us a per-session storage tier,
 *    and a real app launch always re-prompts for OTP anyway (the BE
 *    enforces the 5-minute TTL regardless of what we cached). We use
 *    `expo-secure-store` because the token is sensitive; the wall-clock
 *    `selectIsVerified` check below is what actually gates use.
 *  - **Trust boundary**: separating from the staff store prevents a
 *    staff token from leaking into a consumer request. The transport
 *    (`packages/api/src/client.ts`) picks the right token per URL
 *    prefix via the hooks wired in `wireApi.ts`.
 *  - **No refresh**: there is no `setTokens` here. On expiry the user is
 *    sent back to OTP.
 *
 * Field shapes mirror `OtpVerifyResponse` plus the landing-screen
 * identity, exactly as on web.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { secureStorage } from './secureStorage';

export interface ConsumerAuthState {
  token: string | null;
  /** ISO 8601 UTC string from the BE — the wall-clock expiry. */
  expiresAt: string | null;
  /** What the consumer typed on the landing form; needed by the submit body. */
  consumerId: string | null;
  mobile: string | null;
  /** Commits a successful OTP verification. */
  setVerified: (input: {
    token: string;
    expiresAt: string;
    consumerId: string;
    mobile: string;
  }) => void;
  /**
   * Stores the identity the consumer entered on the landing screen so the
   * OTP modal (and the submit body) can read them back. Called between
   * "Send OTP" and "Verify OTP".
   */
  setIdentity: (input: { consumerId: string; mobile: string }) => void;
  /** Wipes everything — used on manual "start over" and on detected expiry. */
  clear: () => void;
}

const STORAGE_KEY = 'complaints:consumer-auth';

export const useConsumerAuthStore = create<ConsumerAuthState>()(
  persist(
    (set) => ({
      token: null,
      expiresAt: null,
      consumerId: null,
      mobile: null,
      setVerified: ({ token, expiresAt, consumerId, mobile }) =>
        set({ token, expiresAt, consumerId, mobile }),
      setIdentity: ({ consumerId, mobile }) =>
        set({ consumerId, mobile }),
      clear: () =>
        set({ token: null, expiresAt: null, consumerId: null, mobile: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);

/**
 * Wall-clock check: is the verification token still inside its 5-minute
 * window? Driven by `expiresAt`, not by a `setTimeout` — timers are
 * unreliable across app-background / system-suspend. Called on every
 * interaction (guard, mutation onSettled, on focus).
 */
export const selectIsVerified = (s: ConsumerAuthState): boolean => {
  if (!s.token || !s.expiresAt) return false;
  const exp = Date.parse(s.expiresAt);
  if (Number.isNaN(exp)) return false;
  return exp > Date.now();
};

/** UI helper — minutes left, floor()'d, never negative. */
export const selectMinutesRemaining = (s: ConsumerAuthState): number => {
  if (!s.expiresAt) return 0;
  const exp = Date.parse(s.expiresAt);
  if (Number.isNaN(exp)) return 0;
  const ms = exp - Date.now();
  return ms <= 0 ? 0 : Math.floor(ms / 60000);
};

export const selectConsumerToken = (s: ConsumerAuthState): string | null =>
  selectIsVerified(s) ? s.token : null;


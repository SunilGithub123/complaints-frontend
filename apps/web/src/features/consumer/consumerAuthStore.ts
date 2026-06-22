/**
 * Consumer auth store — completely separate from the staff `authStore`.
 *
 * Why a second store (and not a slice on the existing one):
 *  - **Lifetime**: staff session lives in `localStorage`, surviving tab
 *    close. Consumer verification is ephemeral: 5-minute TTL, cleared on
 *    tab close, cleared on manual "start over". `sessionStorage` matches
 *    that lifecycle exactly.
 *  - **Trust boundary**: the staff store grants role-based access to the
 *    admin surface; the consumer store grants ownership of *one* ticket
 *    flow. Mixing them risks a stale staff token leaking into a consumer
 *    request (or vice versa). The transport (`packages/api/src/client.ts`)
 *    picks the right token per URL prefix — see `selectAuthToken`.
 *  - **No refresh**: there is no `setTokens` here; on expiry the user is
 *    sent back to OTP. That's the contract from BE Stage 9.
 *
 * Fields mirror `OtpVerifyResponse` plus the `consumerId` + `mobile` the
 * user typed on the landing screen (the BE JWT carries them too, but
 * decoding it client-side would be busywork — we already have them
 * locally from the form).
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ConsumerAuthState {
  token: string | null;
  /** ISO 8601 UTC string from the BE — the wall-clock expiry. */
  expiresAt: string | null;
  /** What the consumer typed on the landing form; needed by the submit body. */
  consumerId: string | null;
  mobile: string | null;
  /**
   * Commits a successful OTP verification.
   */
  setVerified: (input: {
    token: string;
    expiresAt: string;
    consumerId: string;
    mobile: string;
  }) => void;
  /**
   * Stores the identity the consumer entered on the landing screen so the
   * OTP modal (and the submit body) can read them back. Called before
   * `setVerified` — i.e. between "Send OTP" and "Verify OTP".
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
      // Critical: `sessionStorage`, NOT `localStorage`. Consumer state must
      // not survive a tab close — see the file-level docstring.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.sessionStorage : memoryFallback(),
      ),
    },
  ),
);

/**
 * Wall-clock check: is the verification token still inside its 5-minute
 * window? Driven by `expiresAt`, not by a `setTimeout` — timers are
 * unreliable across tab-sleep / system-suspend. We check this on every
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

/**
 * Last-resort in-memory storage adapter for SSR / Node test environments
 * where `window.sessionStorage` doesn't exist. Production always hits the
 * real `sessionStorage`.
 */
function memoryFallback(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}


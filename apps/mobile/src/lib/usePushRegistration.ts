/**
 * `usePushRegistration` — orchestrates the §9.6 permission trigger for
 * one principal kind (`staff` or `consumer`).
 *
 * Callers wire this at their trigger moment:
 *   - Staff: `app/index.tsx` when `isAuthenticated` first flips true.
 *   - Consumer: after a successful complaint submit, before navigating
 *     to the confirmation route.
 *
 * The hook is intentionally **imperative** — it exposes a
 * `runIfNeeded()` function rather than firing on mount. Callers know
 * when the trigger moment is; the hook's job is to short-circuit if
 * the moment has already been used (`lastRegisteredDeviceId` set), if
 * the user recently denied (`pushPromptCooldown`), or if the OS says
 * push is unavailable.
 *
 * On grant: `requestPermission()` → `registerStaff` / `registerConsumer`
 * → auth store's `setLastRegisteredDeviceId` fires from inside the
 * `pushRegistration` helpers.
 * On deny: `markDenied(principal)` records the timestamp; next trigger
 * within 7 days skips.
 *
 * NEVER throws. Push failures MUST NOT block the calling flow (login,
 * submit). The single side effect of a failure is that no
 * `POST /devices` fires this session.
 */
import { useCallback } from 'react';

import { useAuthStore } from '@/auth/authStore';
import { useConsumerAuthStore } from '@/auth/consumerAuthStore';
import {
  registerConsumer,
  registerStaff,
  type RegistrationCallerHooks,
} from './pushRegistration';
import { getActivePushProvider } from './pushProvider';
import { isCoolingDown, markDenied, type Principal } from './pushPromptCooldown';

interface RunOptions {
  /**
   * Skip the "already registered" short-circuit and force a re-register.
   * Reserved for a future "resend push token" settings button; not used
   * by any v1 trigger.
   */
  force?: boolean;
}

export type RunOutcome =
  | 'registered'
  | 'skipped-already-registered'
  | 'skipped-cooling-down'
  | 'skipped-permission-denied'
  | 'skipped-no-token';

function makeStaffHooks(): RegistrationCallerHooks {
  return {
    getLastRegisteredDeviceId: () =>
      useAuthStore.getState().lastRegisteredDeviceId,
    setLastRegisteredDeviceId: (v) =>
      useAuthStore.getState().setLastRegisteredDeviceId(v),
  };
}

function makeConsumerHooks(): RegistrationCallerHooks {
  return {
    getLastRegisteredDeviceId: () =>
      useConsumerAuthStore.getState().lastRegisteredDeviceId,
    setLastRegisteredDeviceId: (v) =>
      useConsumerAuthStore.getState().setLastRegisteredDeviceId(v),
  };
}

export function usePushRegistration(principal: Principal): {
  runIfNeeded: (opts?: RunOptions) => Promise<RunOutcome>;
} {
  const runIfNeeded = useCallback(
    async (opts?: RunOptions): Promise<RunOutcome> => {
      const hooks =
        principal === 'staff' ? makeStaffHooks() : makeConsumerHooks();

      if (!opts?.force && hooks.getLastRegisteredDeviceId() !== null) {
        return 'skipped-already-registered';
      }

      if (await isCoolingDown(principal)) {
        return 'skipped-cooling-down';
      }

      const provider = getActivePushProvider();
      // We call requestPermission unconditionally so a first-time user
      // sees the OS prompt. If the OS says "already denied" the return
      // value is false and we record the cooldown — the OS won't show
      // its dialog again anyway (iOS especially caches the denial).
      let granted: boolean;
      try {
        granted = await provider.requestPermission();
      } catch {
        granted = false;
      }
      if (!granted) {
        await markDenied(principal);
        return 'skipped-permission-denied';
      }

      try {
        const register = principal === 'staff' ? registerStaff : registerConsumer;
        const result = await register(hooks);
        if (result.outcome === 'skipped') {
          return result.reason === 'no-token' ? 'skipped-no-token' : 'skipped-permission-denied';
        }
        return 'registered';
      } catch {
        // Push failure MUST NOT block auth / submit flows (§9.4 spirit
        // for consumer + §9.6 for staff). Swallow and let the caller
        // proceed. The BE will collect the missed registration on the
        // next trigger.
        return 'skipped-no-token';
      }
    },
    [principal],
  );

  return { runIfNeeded };
}


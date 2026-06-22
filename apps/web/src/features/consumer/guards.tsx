/**
 * `ConsumerRequireVerification` — route guard analogous to staff's
 * `RequireAuth`. Gates `/consumer/submit` and `/consumer/submitted/:id`
 * by checking the wall-clock validity of the in-memory consumer JWT.
 *
 * Wall-clock not timer: `setTimeout` is unreliable across tab-sleep, so
 * we evaluate `Date.parse(expiresAt) > Date.now()` on every render. The
 * `RequireAuth`-shaped contract (an Outlet wrapper, Navigate on miss)
 * stays consistent with the staff side.
 *
 * On miss we navigate back to `/consumer` and pass the intended URL in
 * `state.from`; the landing screen reads it to resume the flow after
 * re-OTP (preserves the draft we already keep in sessionStorage).
 */
import type { ReactElement } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  useConsumerAuthStore,
  selectIsVerified,
} from '@/features/consumer/consumerAuthStore';

export function ConsumerRequireVerification(): ReactElement {
  const isVerified = useConsumerAuthStore(selectIsVerified);
  const location = useLocation();
  if (!isVerified) {
    // Clearing the token (rather than leaving the stale value sitting in
    // sessionStorage) makes a subsequent "Send OTP" idempotent — the
    // store starts from a clean slate.
    useConsumerAuthStore.getState().clear();
    return (
      <Navigate
        to="/consumer"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <Outlet />;
}


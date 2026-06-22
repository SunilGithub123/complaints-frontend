/* eslint-disable react-refresh/only-export-components -- co-located constant / hook exports are intentional; HMR isn't meaningful for these files (route wiring / cva variants / store) */
/**
 * Route-level guards (the "decorator-equivalent" called out in
 * .github/copilot-instructions.md → Pattern hints). Per-component role
 * checks would be repetitive; centralising at the router edge is cheaper
 * to reason about.
 *
 * Three guards:
 *  - `RequireAuth`              → "must be signed in"; also revalidates
 *                                 the cached staff snapshot against
 *                                 `GET /staff/me` once per session
 *                                 (Stage 8a). The localStorage-hydrated
 *                                 staff object may be stale (admin
 *                                 demoted to engineer, full name edited
 *                                 server-side, etc.) so we replace it
 *                                 before rendering children.
 *  - `RequirePasswordChanged`   → "must have cleared the first-login reset"
 *  - `RequireRole({ roles })`   → "must hold one of these roles"
 *
 * Mirrors the backend constraint (Stage 1 — see
 * ../../../../complaints/docs/IMPLEMENTATION_LOG.md): until
 * `passwordResetRequired === false` the only callable endpoints are
 * `/staff/auth/change-password`, `/staff/auth/logout`, `/staff/me`.
 */
import type { ReactElement } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMe, type Schemas } from '@complaints/api';
import {
  useAuthStore,
  selectStaff,
  selectIsAuthenticated,
  selectLastValidatedAt,
} from '@/auth/authStore';
import { Skeleton } from '@/components/ui/skeleton';

/** Routes a staff member with `passwordResetRequired` may still visit. */
export const PASSWORD_RESET_ALLOWLIST: readonly string[] = [
  '/change-password',
  '/logout',
];

export function RequireAuth(): ReactElement {
  const isAuthed = useAuthStore(selectIsAuthenticated);
  const lastValidatedAt = useAuthStore(selectLastValidatedAt);
  const setValidatedStaff = useAuthStore((s) => s.setValidatedStaff);
  const location = useLocation();

  // Boot-time revalidation. Skipped entirely for anonymous visitors so the
  // hook never fires without a token. We deliberately gate the call with
  // `enabled` rather than calling `useMe` conditionally — Rules of Hooks.
  const needsRevalidation = isAuthed && lastValidatedAt === null;
  const meQuery = useMe<
    { data?: Schemas.ApiResponseStaffSummaryResponse },
    unknown
  >({
    query: {
      enabled: needsRevalidation,
      // One-shot — staleTime is irrelevant because we only fire when
      // lastValidatedAt is null, and we set it on success.
      retry: false,
      refetchOnWindowFocus: false,
    },
  });

  // Anonymous → straight to login, BEFORE we look at the query state.
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Revalidation in flight on first hit of the session. Show the same
  // skeleton the route-level Suspense uses so we never flash a stale
  // dashboard against fresh server state.
  if (needsRevalidation && meQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Skeleton className="h-32 w-full max-w-md" />
      </div>
    );
  }

  // Successful revalidation → commit the server-truth staff into the
  // store. If the role / subdivision / DC changed, downstream
  // RequireRole guards will pick the new value up on the next render.
  // We commit during render via getState() to avoid a useEffect →
  // double-render flicker; setValidatedStaff is idempotent (same data
  // sets the same state slice, so no extra re-render).
  if (
    needsRevalidation &&
    meQuery.isSuccess &&
    meQuery.data?.data?.success === true &&
    meQuery.data.data.data
  ) {
    const fresh = meQuery.data.data.data;
    const current = useAuthStore.getState().staff;
    // Only write if something changed — avoids a needless render.
    if (!current || !sameStaff(current, fresh)) {
      setValidatedStaff(fresh);
    } else {
      // Still bump lastValidatedAt so we don't re-enter this branch.
      setValidatedStaff(current);
    }
  }

  // If revalidation failed for a non-401 reason (e.g. network), we still
  // render with the cached snapshot. The transport already dispatched
  // `auth:logout` for 401-after-refresh-fail, so by the time we're here
  // with `isAuthed === true` the cache is good enough to proceed.

  return <Outlet />;
}

function sameStaff(
  a: Schemas.StaffSummaryResponse,
  b: Schemas.StaffSummaryResponse,
): boolean {
  return (
    a.id === b.id &&
    a.employeeId === b.employeeId &&
    a.fullName === b.fullName &&
    a.role === b.role &&
    a.subdivisionId === b.subdivisionId &&
    a.distributionCenterId === b.distributionCenterId &&
    a.passwordResetRequired === b.passwordResetRequired &&
    a.notificationsPushEnabled === b.notificationsPushEnabled
  );
}

export function RequirePasswordChanged(): ReactElement {
  const staff = useAuthStore(selectStaff);
  const location = useLocation();
  const mustChange = staff?.passwordResetRequired === true;
  const allowed = PASSWORD_RESET_ALLOWLIST.includes(location.pathname);
  if (mustChange && !allowed) {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

export interface RequireRoleProps {
  roles: ReadonlyArray<NonNullable<ReturnType<typeof selectStaff>>['role']>;
}

export function RequireRole({ roles }: RequireRoleProps): ReactElement {
  const staff = useAuthStore(selectStaff);
  if (!staff || !staff.role || !roles.includes(staff.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
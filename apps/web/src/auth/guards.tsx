/**
 * Route-level guards (the "decorator-equivalent" called out in
 * .github/copilot-instructions.md → Pattern hints). Per-component role
 * checks would be repetitive; centralising at the router edge is cheaper
 * to reason about.
 *
 * Three guards:
 *  - `RequireAuth`              → "must be signed in"
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
import { useAuthStore, selectStaff, selectIsAuthenticated } from '@/auth/authStore';

/** Routes a staff member with `passwordResetRequired` may still visit. */
export const PASSWORD_RESET_ALLOWLIST: readonly string[] = [
  '/change-password',
  '/logout',
];

export function RequireAuth(): ReactElement {
  const isAuthed = useAuthStore(selectIsAuthenticated);
  const location = useLocation();
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
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


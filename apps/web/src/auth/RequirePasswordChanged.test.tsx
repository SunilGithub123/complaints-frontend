/**
 * RequirePasswordChanged guard — 2 tests:
 *
 *   1. When `staff.passwordResetRequired === true` and the staff hits a
 *      non-allowlisted route, they are redirected to `/change-password`.
 *   2. When `staff.passwordResetRequired === false`, the protected child
 *      renders.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequirePasswordChanged } from '@/auth/guards';
import { useAuthStore } from '@/auth/authStore';
import type { Schemas } from '@complaints/api';

function staff(passwordResetRequired: boolean): Schemas.StaffSummaryResponse {
  return {
    id: 1,
    employeeId: 'ADMIN001',
    fullName: 'Alice Admin',
    role: 'ADMIN',
    passwordResetRequired,
  };
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequirePasswordChanged />}>
          <Route path="/" element={<div>protected-home</div>} />
          <Route
            path="/masterdata/subdivisions"
            element={<div>protected-subdivisions</div>}
          />
        </Route>
        <Route path="/change-password" element={<div>change-password-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequirePasswordChanged', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('redirects to /change-password when passwordResetRequired and route is not allowlisted', () => {
    useAuthStore.setState({
      accessToken: 'a',
      refreshToken: 'r',
      staff: staff(true),
    });
    renderAt('/masterdata/subdivisions');
    expect(screen.getByText('change-password-screen')).toBeInTheDocument();
    expect(screen.queryByText('protected-subdivisions')).not.toBeInTheDocument();
  });

  it('renders the protected route when passwordResetRequired is false', () => {
    useAuthStore.setState({
      accessToken: 'a',
      refreshToken: 'r',
      staff: staff(false),
    });
    renderAt('/');
    expect(screen.getByText('protected-home')).toBeInTheDocument();
  });
});


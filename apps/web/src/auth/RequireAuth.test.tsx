/**
 * RequireAuth — Stage 8a boot-time revalidation tests.
 *
 *  1. Happy: token in store, `useMe` returns an updated role (ADMIN →
 *     ENGINEER server-side). The guard commits the fresh staff into
 *     the auth store before rendering its protected child.
 *  2. Unhappy: `useMe` is in the error state (caller-side proxy for the
 *     "401 → refresh failed → auth:logout dispatched" path the
 *     transport owns). The guard still falls through to render so the
 *     existing `auth:logout` listener in App.tsx can navigate away —
 *     we just verify the guard does NOT block forever on a failure
 *     and the child eventually renders against the cached snapshot.
 *
 * We mock `useMe` rather than going through TanStack Query + the
 * transport; the transport already has its own happy + 401-refresh
 * tests in `@complaints/api`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/guards';
import { useAuthStore } from '@/auth/authStore';
import type { Schemas } from '@complaints/api';

const useMeMock = vi.fn();

vi.mock('@complaints/api', async () => {
  const actual = await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useMe: (...args: unknown[]) => useMeMock(...args),
  };
});

function staff(role: Schemas.StaffSummaryResponse['role']): Schemas.StaffSummaryResponse {
  return {
    id: 1,
    employeeId: 'ADMIN001',
    fullName: 'Alice Admin',
    role,
    passwordResetRequired: false,
  };
}

function renderTree(): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/" element={<div>protected-home</div>} />
        </Route>
        <Route path="/login" element={<div>login-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth — boot-time /me revalidation', () => {
  beforeEach(() => {
    useMeMock.mockReset();
    useAuthStore.getState().clear();
  });

  it('replaces the cached staff snapshot with the server-truth role and renders the child', () => {
    // Cached snapshot: ADMIN. Server-truth: ENGINEER (admin demoted).
    useAuthStore.setState({
      accessToken: 'a',
      refreshToken: 'r',
      staff: staff('ADMIN'),
      lastValidatedAt: null,
    });
    useMeMock.mockReturnValue({
      isPending: false,
      isSuccess: true,
      data: {
        data: {
          success: true,
          data: staff('ENGINEER'),
        },
      },
    });

    renderTree();

    expect(screen.getByText('protected-home')).toBeInTheDocument();
    expect(useAuthStore.getState().staff?.role).toBe('ENGINEER');
    expect(useAuthStore.getState().lastValidatedAt).not.toBeNull();
  });

  it('falls through to render the cached staff when /me is in an error state', () => {
    // Cached snapshot stays untouched on /me failure — the transport's
    // 401-then-refresh-fail path dispatches `auth:logout` which App.tsx
    // listens for; the guard itself does not block on error.
    useAuthStore.setState({
      accessToken: 'a',
      refreshToken: 'r',
      staff: staff('ADMIN'),
      lastValidatedAt: null,
    });
    useMeMock.mockReturnValue({
      isPending: false,
      isSuccess: false,
      isError: true,
      data: undefined,
    });

    renderTree();

    expect(screen.getByText('protected-home')).toBeInTheDocument();
    expect(useAuthStore.getState().staff?.role).toBe('ADMIN');
    // Not validated — the next mount will retry.
    expect(useAuthStore.getState().lastValidatedAt).toBeNull();
  });
});


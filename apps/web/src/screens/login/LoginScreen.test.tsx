/**
 * LoginScreen — 2 tests, per the minimum-test policy in
 * .github/copilot-instructions.md → "Per form / screen".
 *
 *   1. Happy path: submit → success → navigates to '/'.
 *   2. Unhappy path: `ApiError('BAD_CREDENTIALS')` → inline error shown,
 *      and `navigate` was NOT called.
 *
 * We mock `useLoginStaff` from `@complaints/api` rather than going through the
 * transport — testing TanStack Query's retry/cache behaviour is not the
 * value here. `useNavigate` is mocked likewise.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@complaints/api';
import LoginScreen from './LoginScreen';
import { useAuthStore } from '@/auth/authStore';

const navigateMock = vi.fn();
const loginMutateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@complaints/api', async () => {
  const actual = await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useLoginStaff: () => ({ mutateAsync: loginMutateMock, isPending: false }),
  };
});

function renderScreen(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <LoginScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginScreen', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    loginMutateMock.mockReset();
    useAuthStore.getState().clear();
  });

  it('submits valid credentials, stores the session and navigates to /', async () => {
    loginMutateMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          accessToken: 'acc-1',
          refreshToken: 'ref-1',
          staff: {
            id: 1,
            employeeId: 'ADMIN001',
            fullName: 'Alice Admin',
            role: 'ADMIN',
            passwordResetRequired: false,
          },
        },
      },
    });

    renderScreen();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/employee id/i), 'ADMIN001');
    await user.type(screen.getByLabelText(/password/i), 'CorrectHorse#1');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(loginMutateMock).toHaveBeenCalledTimes(1);
    expect(loginMutateMock).toHaveBeenCalledWith({
      data: { employeeId: 'ADMIN001', password: 'CorrectHorse#1' },
    });
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    expect(useAuthStore.getState().accessToken).toBe('acc-1');
  });

  it('shows the localized BAD_CREDENTIALS message and does not navigate', async () => {
    loginMutateMock.mockRejectedValueOnce(
      new ApiError({ code: 'BAD_CREDENTIALS', message: 'bad', status: 401 }),
    );

    renderScreen();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/employee id/i), 'ADMIN001');
    await user.type(screen.getByLabelText(/password/i), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByText(/employee id or password is incorrect/i),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});



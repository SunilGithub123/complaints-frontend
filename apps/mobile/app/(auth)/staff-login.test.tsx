/**
 * staff-login — 2 tests per the minimum-test policy.
 *
 *  1. Happy: valid credentials → `useLoginStaff` resolves with a
 *     non-reset session → authStore populated + `router.replace('/')`.
 *  2. Unhappy: BAD_CREDENTIALS → BRD §4.1 generic copy is shown and
 *     `router.replace` was NOT called.
 *
 * Identical contract to `apps/web/src/screens/login/LoginScreen.test.tsx`
 * — kept that way deliberately so a regression in either platform is
 * visible against the same shape.
 *
 * NB on naming: jest hoists `jest.mock()` calls above all imports and
 * variable declarations. The mock factory can only reference top-level
 * names that start with `mock` (case-insensitive). Hence
 * `mockReplace` / `mockLoginMutate` and not the friendlier `replaceMock`.
 */
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@complaints/api';

import StaffLoginScreen from './staff-login';
import { useAuthStore } from '@/auth/authStore';
import { useConsumerAuthStore } from '@/auth/consumerAuthStore';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockLoginMutate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  Redirect: ({ href }: { href: string }) => `Redirect:${href}`,
}));

jest.mock('@complaints/api', () => {
  const actual = jest.requireActual('@complaints/api');
  return {
    ...actual,
    useLoginStaff: () => ({ mutateAsync: mockLoginMutate, isPending: false }),
  };
});

function renderScreen(): void {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <StaffLoginScreen />
    </QueryClientProvider>,
  );
}

describe('staff-login screen', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockLoginMutate.mockReset();
    useAuthStore.getState().clear();
    useConsumerAuthStore.getState().clear();
  });

  it('stores the session and replaces to / on a successful login', async () => {
    mockLoginMutate.mockResolvedValueOnce({
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
    await user.type(screen.getByLabelText(/^password$/i), 'CorrectHorse#1');
    await user.press(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockLoginMutate).toHaveBeenCalledWith({
      data: { employeeId: 'ADMIN001', password: 'CorrectHorse#1' },
    });
    expect(useAuthStore.getState().accessToken).toBe('acc-1');
  });

  it('shows the generic BAD_CREDENTIALS copy and does not navigate', async () => {
    mockLoginMutate.mockRejectedValueOnce(
      new ApiError({ code: 'BAD_CREDENTIALS', message: 'bad', status: 401 }),
    );

    renderScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/employee id/i), 'ADMIN001');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong');
    await user.press(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByText(/employee id or password is incorrect/i),
    ).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});


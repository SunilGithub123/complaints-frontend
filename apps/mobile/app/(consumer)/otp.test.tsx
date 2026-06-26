/**
 * consumer otp — 2 tests per the minimum-test policy.
 *
 *  1. Happy: identity preset in the store → user enters OTP →
 *     `useVerifyConsumerOtp` resolves → consumerAuthStore gets the
 *     verification token + `router.replace('/(consumer)/submit')`.
 *  2. Unhappy: BE returns OTP_TOO_MANY_ATTEMPTS on verify → localized
 *     copy shown, input locks (disabled), no token committed.
 *
 * See `staff-login.test.tsx` for the `mock*` naming convention note.
 */
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '@complaints/api';

import ConsumerOtpScreen from './otp';
import { useAuthStore } from '@/auth/authStore';
import { useConsumerAuthStore } from '@/auth/consumerAuthStore';

const INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const FRAME = { x: 0, y: 0, width: 320, height: 640 };

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockVerifyMutate = jest.fn();
const mockSendMutate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  Redirect: ({ href }: { href: string }) => `Redirect:${href}`,
}));

jest.mock('@complaints/api', () => {
  const actual = jest.requireActual('@complaints/api');
  return {
    ...actual,
    useVerifyConsumerOtp: () => ({ mutateAsync: mockVerifyMutate, isPending: false }),
    useSendConsumerOtp: () => ({ mutateAsync: mockSendMutate, isPending: false }),
  };
});

function renderScreen(): void {
  // Seed identity — the landing screen sets this before navigating; the
  // OTP screen redirects to landing if it's missing.
  useConsumerAuthStore.getState().setIdentity({
    consumerId: 'CN-00012345',
    mobile: '9999999999',
  });
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <SafeAreaProvider initialMetrics={{ insets: INSETS, frame: FRAME }}>
      <QueryClientProvider client={queryClient}>
        <ConsumerOtpScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('consumer otp screen', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockVerifyMutate.mockReset();
    mockSendMutate.mockReset();
    useAuthStore.getState().clear();
    useConsumerAuthStore.getState().clear();
  });

  it('commits the verification token and replaces to /submit on success', async () => {
    mockVerifyMutate.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          verificationToken: 'verify-jwt-xyz',
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
      },
    });

    renderScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/enter otp/i), '123456');
    await user.press(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(consumer)/submit'),
    );
    const s = useConsumerAuthStore.getState();
    expect(s.token).toBe('verify-jwt-xyz');
    expect(s.consumerId).toBe('CN-00012345');
  });

  it('locks the input and surfaces copy on OTP_TOO_MANY_ATTEMPTS', async () => {
    mockVerifyMutate.mockRejectedValueOnce(
      new ApiError({
        code: 'OTP_TOO_MANY_ATTEMPTS',
        message: 'locked',
        status: 429,
      }),
    );

    renderScreen();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/enter otp/i);
    await user.type(input, '000000');
    await user.press(screen.getByRole('button', { name: /^verify$/i }));

    expect(
      await screen.findByText(/too many incorrect attempts/i),
    ).toBeOnTheScreen();
    // Input disabled after the lock.
    expect(input.props.editable).toBe(false);
    expect(useConsumerAuthStore.getState().token).toBeNull();
  });
});




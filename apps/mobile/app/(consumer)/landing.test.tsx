/**
 * consumer landing — 2 tests per the minimum-test policy.
 *
 *  1. Happy: valid Consumer ID + mobile → `useSendConsumerOtp` resolves
 *     → identity persisted + router pushes to the OTP route.
 *  2. Unhappy: BE returns OTP_RATE_LIMIT → localized copy is shown and
 *     the OTP route was NOT pushed.
 *
 * `mapApiError` is exercised via the unhappy path — that's why we
 * picked an `errors.OTP_RATE_LIMIT` key (defined in the i18n catalogue).
 *
 * See `staff-login.test.tsx` for the `mock*` naming convention note.
 */
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '@complaints/api';

import ConsumerLandingScreen from './landing';
import { useAuthStore } from '@/auth/authStore';
import { useConsumerAuthStore } from '@/auth/consumerAuthStore';

// Fixed insets stub so `useSafeAreaInsets` returns a sane value in tests
// without us having to mount a real provider tree. Same trick the
// react-native-safe-area-context docs recommend for jest setups.
const INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const FRAME = { x: 0, y: 0, width: 320, height: 640 };

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSendMutate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  Redirect: ({ href }: { href: string }) => `Redirect:${href}`,
}));

jest.mock('@complaints/api', () => {
  const actual = jest.requireActual('@complaints/api');
  return {
    ...actual,
    useSendConsumerOtp: () => ({ mutateAsync: mockSendMutate, isPending: false }),
  };
});

function renderScreen(): void {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <SafeAreaProvider initialMetrics={{ insets: INSETS, frame: FRAME }}>
      <QueryClientProvider client={queryClient}>
        <ConsumerLandingScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('consumer landing screen', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSendMutate.mockReset();
    useAuthStore.getState().clear();
    useConsumerAuthStore.getState().clear();
  });

  it('records identity and pushes to /(consumer)/otp on a successful send', async () => {
    mockSendMutate.mockResolvedValueOnce({
      data: { success: true, data: {} },
    });

    renderScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/consumer id/i), 'CN-00012345');
    await user.type(screen.getByLabelText(/^mobile$/i), '9999999999');
    await user.press(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/(consumer)/otp'),
    );
    const s = useConsumerAuthStore.getState();
    expect(s.consumerId).toBe('CN-00012345');
    expect(s.mobile).toBe('9999999999');
    // Token is NOT set yet — that's the OTP screen's job.
    expect(s.token).toBeNull();
  });

  it('surfaces the localized OTP_RATE_LIMIT copy and does not navigate', async () => {
    mockSendMutate.mockRejectedValueOnce(
      new ApiError({ code: 'OTP_RATE_LIMIT', message: 'rate', status: 429 }),
    );

    renderScreen();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/consumer id/i), 'CN-00012345');
    await user.type(screen.getByLabelText(/^mobile$/i), '9999999999');
    await user.press(screen.getByRole('button', { name: /send otp/i }));

    expect(
      await screen.findByText(/too many otps for this number/i),
    ).toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
  });
});




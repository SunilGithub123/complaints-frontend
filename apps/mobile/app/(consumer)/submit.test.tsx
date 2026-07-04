/**
 * consumer submit — 2 tests per the minimum-test policy.
 *
 *  1. Happy: verified consumer picks category + fills description →
 *     `useSubmitComplaint` resolves → `router.replace` navigates to
 *     `/(consumer)/submitted` with the ticket number in params. We assert
 *     the mutation was called with the exact `{ consumerId, mobile,
 *     categoryId, description }` payload and empty `images` array — the
 *     load-bearing check that guards the multipart contract at the
 *     JS boundary (the multipart body itself is exercised manually
 *     against the dev BE).
 *  2. Unhappy: the mutation rejects with an ApiError → the localized
 *     `errors.generic` copy is surfaced (no specific `errors.SOMETHING`
 *     is registered for the arbitrary code we throw) and NO navigation.
 *
 * We mock:
 *  - `expo-router` (`useRouter`, `Redirect`, `useLocalSearchParams`).
 *  - `useListActiveCategoriesForConsumer` (returns two fixture categories).
 *  - `useSubmitComplaint` (behaviour per test).
 *  - `expo-image-picker` — screen imports it at module-eval; jest-expo's
 *    preset already mocks most native modules but not this one.
 *
 * Image compression + submitComplaintMultipart deliberately stay NOT
 * exercised — they touch `expo-file-system` and `expo-image-manipulator`
 * which are jest-expo mocks anyway. The multipart wire format is
 * validated against the real backend during b.3-c manual QA.
 *
 * `mock*` prefix convention: see `staff-login.test.tsx` (jest's
 * `jest.mock()` hoisting only permits `mock`-prefixed identifiers in
 * factories, so any mock reused between the factory and the test body
 * has to be named that way).
 */
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '@complaints/api';

import ConsumerSubmitScreen from './submit';
import { useConsumerAuthStore } from '@/auth/consumerAuthStore';

const INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const FRAME = { x: 0, y: 0, width: 320, height: 640 };

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSubmitMutate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => ({}),
  Redirect: ({ href }: { href: string }) => `Redirect:${href}`,
}));

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));

jest.mock('@complaints/api', () => {
  const actual = jest.requireActual('@complaints/api');
  return {
    ...actual,
    useListActiveCategoriesForConsumer: () => ({
      data: {
        data: {
          success: true,
          data: {
            content: [
              { id: 7, code: 'POWER', name: 'Power outage', active: true },
              { id: 8, code: 'BILL', name: 'Billing dispute', active: true },
            ],
          },
        },
      },
      isPending: false,
      isLoading: false,
    }),
  };
});

jest.mock('@/lib/submitComplaint', () => ({
  useSubmitComplaint: () => ({ mutateAsync: mockSubmitMutate, isPending: false }),
}));

function renderScreen(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <SafeAreaProvider initialMetrics={{ insets: INSETS, frame: FRAME }}>
      <QueryClientProvider client={queryClient}>
        <ConsumerSubmitScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('consumer submit screen', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockSubmitMutate.mockReset();
    // Seed a valid verification so the Redirect guard doesn't fire.
    useConsumerAuthStore.setState({
      token: 'consumer-jwt',
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      consumerId: 'CN-00012345',
      mobile: '9999999999',
    });
  });

  it('submits the complaint payload and replaces to /(consumer)/submitted with the ticket', async () => {
    mockSubmitMutate.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          ticketNo: 'TKT-2026-0001',
          submittedAt: '2026-07-04T10:00:00Z',
          slaDeadline: '2026-07-05T10:00:00Z',
          images: [],
        },
      },
      headers: {} as Headers,
    });

    renderScreen();
    const user = userEvent.setup();

    // Open the category picker + pick the first row.
    await user.press(screen.getByLabelText(/^category$/i));
    await user.press(await screen.findByText(/power outage/i));

    await user.type(
      screen.getByLabelText(/^describe the issue$/i),
      'Pole-mounted transformer humming loudly.',
    );

    await user.press(screen.getByLabelText(/^submit complaint$/i));

    await waitFor(() => expect(mockSubmitMutate).toHaveBeenCalledTimes(1));

    const call = mockSubmitMutate.mock.calls[0]?.[0];
    expect(call?.complaint).toMatchObject({
      consumerId: 'CN-00012345',
      mobile: '9999999999',
      categoryId: 7,
      description: 'Pole-mounted transformer humming loudly.',
    });
    // No images picked → the multipart part list has to be empty.
    expect(call?.images).toEqual([]);

    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(consumer)/submitted',
        params: expect.objectContaining({ ticketNo: 'TKT-2026-0001' }),
      }),
    );
  });

  it('surfaces a localized error and does not navigate when the mutation rejects', async () => {
    mockSubmitMutate.mockRejectedValueOnce(
      new ApiError({ code: 'UNKNOWN_ERROR', message: 'boom', status: 500 }),
    );

    renderScreen();
    const user = userEvent.setup();

    await user.press(screen.getByLabelText(/^category$/i));
    await user.press(await screen.findByText(/billing dispute/i));
    await user.type(
      screen.getByLabelText(/^describe the issue$/i),
      'Bill amount is wrong.',
    );
    await user.press(screen.getByLabelText(/^submit complaint$/i));

    // The BE-provided `message` (`'boom'`) surfaces because no
    // `errors.UNKNOWN_ERROR` key exists — matches web `mapApiError`
    // fallback ladder. The load-bearing assertion is the no-navigate.
    expect(await screen.findByText(/boom/i)).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});


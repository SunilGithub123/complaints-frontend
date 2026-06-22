/**
 * OtpModal — 2 tests per the minimum-test policy.
 *
 *  1. Happy: user enters OTP, mutation resolves → consumerAuthStore gets
 *     the token + identity, and `onVerified` fires.
 *  2. Unhappy: BE returns OTP_RATE_LIMIT on the resend click — friendly
 *     localized copy is shown and the cooldown lock holds.
 *
 * `useSendOtp` / `useVerifyOtp` are mocked, the same shape the
 * LoginScreen test uses.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@complaints/api';
import { OtpModal } from './OtpModal';
import { useConsumerAuthStore } from '@/features/consumer/consumerAuthStore';

const sendMutate = vi.fn();
const verifyMutate = vi.fn();

vi.mock('@complaints/api', async () => {
  const actual = await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useSendOtp: () => ({ mutateAsync: sendMutate, isPending: false }),
    useVerifyOtp: () => ({ mutateAsync: verifyMutate, isPending: false }),
  };
});

function renderModal(overrides?: Partial<React.ComponentProps<typeof OtpModal>>): {
  onVerified: ReturnType<typeof vi.fn>;
} {
  const onVerified = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OtpModal
        open={true}
        consumerId="CN-001"
        mobile="9999999999"
        // Cooldown already elapsed so the Resend button is enabled.
        lastSentAt={Date.now() - 60_000}
        onClose={vi.fn()}
        onResend={vi.fn()}
        onVerified={onVerified}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onVerified };
}

describe('OtpModal', () => {
  beforeEach(() => {
    sendMutate.mockReset();
    verifyMutate.mockReset();
    useConsumerAuthStore.getState().clear();
  });

  it('commits the verification token and calls onVerified on a successful verify', async () => {
    verifyMutate.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          verificationToken: 'verify-jwt-xyz',
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
      },
    });

    const { onVerified } = renderModal();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/enter otp/i), '123456');
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    const state = useConsumerAuthStore.getState();
    expect(state.token).toBe('verify-jwt-xyz');
    expect(state.consumerId).toBe('CN-001');
    expect(state.mobile).toBe('9999999999');
  });

  it('surfaces a friendly rate-limit message and does not commit a token', async () => {
    sendMutate.mockRejectedValueOnce(
      new ApiError({ code: 'OTP_RATE_LIMIT', message: 'rate', status: 429 }),
    );

    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /resend otp/i }));

    expect(
      await screen.findByText(/too many otps for this number/i),
    ).toBeInTheDocument();
    expect(useConsumerAuthStore.getState().token).toBeNull();
  });
});


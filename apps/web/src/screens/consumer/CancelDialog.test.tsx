/**
 * CancelDialog — 2 tests, per minimum-test policy.
 *
 *  1. Happy: submit with no reason → useCancel fires with `{ data: {} }`
 *     and `onSuccess` is called.
 *  2. Unhappy: BE returns 409 COMPLAINT_NOT_IN_SUBMITTED_STATE →
 *     `onStaleStatus` fires (the parent will refetch + hide the
 *     Cancel button) and `onSuccess` is NOT called.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@complaints/api';
import { CancelDialog } from './CancelDialog';

const mockCancel = vi.fn();

beforeEach(() => {
  mockCancel.mockReset();
});

vi.mock('@complaints/api', async () => {
  const actual =
    await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useCancelComplaint: () => ({ mutateAsync: mockCancel, isPending: false }),
  };
});

function renderDialog(props: {
  onSuccess?: () => void;
  onStaleStatus?: () => void;
  onSessionLost?: () => void;
}): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CancelDialog
        open={true}
        onClose={() => {}}
        ticketNo="CMP-2026-00042"
        onSuccess={props.onSuccess ?? (() => {})}
        onStaleStatus={props.onStaleStatus ?? (() => {})}
        onSessionLost={props.onSessionLost ?? (() => {})}
      />
    </QueryClientProvider>,
  );
}

describe('CancelDialog', () => {
  it('cancels without a reason and fires onSuccess', async () => {
    mockCancel.mockResolvedValueOnce({});
    const onSuccess = vi.fn();
    renderDialog({ onSuccess });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^cancel complaint$/i }));

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith({
      ticketNo: 'CMP-2026-00042',
      data: {},
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('routes 409 COMPLAINT_NOT_IN_SUBMITTED_STATE to onStaleStatus', async () => {
    mockCancel.mockRejectedValueOnce(
      new ApiError({
        code: 'COMPLAINT_NOT_IN_SUBMITTED_STATE',
        message: 'stale',
        status: 409,
      }),
    );
    const onSuccess = vi.fn();
    const onStaleStatus = vi.fn();
    renderDialog({ onSuccess, onStaleStatus });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^cancel complaint$/i }));

    expect(onStaleStatus).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});


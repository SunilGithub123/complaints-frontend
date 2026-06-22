/**
 * FeedbackDialog — 2 tests, per minimum-test policy.
 *
 *  1. Happy: pick a 4-star rating, submit → useSubmitFeedback fires
 *     with `{ rating: 4 }` and onSubmitted is called.
 *  2. Unhappy: BE returns 409 FEEDBACK_ALREADY_SUBMITTED → the dialog
 *     switches to the "thanks, already received" state and the
 *     ticket is remembered in sessionStorage.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@complaints/api';
import { FeedbackDialog, wasSubmittedThisSession } from './FeedbackDialog';

const mockSubmit = vi.fn();

beforeEach(() => {
  mockSubmit.mockReset();
  window.sessionStorage.clear();
});

vi.mock('@complaints/api', async () => {
  const actual =
    await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useSubmitFeedback: () => ({ mutateAsync: mockSubmit, isPending: false }),
  };
});

function renderDialog(onSubmitted: () => void = () => {}): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FeedbackDialog
        open={true}
        onClose={() => {}}
        ticketNo="CMP-2026-00042"
        onSubmitted={onSubmitted}
      />
    </QueryClientProvider>,
  );
}

describe('FeedbackDialog', () => {
  it('submits a 4-star rating and fires onSubmitted', async () => {
    mockSubmit.mockResolvedValueOnce({});
    const onSubmitted = vi.fn();
    renderDialog(onSubmitted);

    const user = userEvent.setup();
    // StarPicker exposes one radio per star with aria-label "1".."5".
    await user.click(screen.getByRole('radio', { name: '4' }));
    await user.click(screen.getByRole('button', { name: /^submit feedback$/i }));

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledWith({
      ticketNo: 'CMP-2026-00042',
      data: { rating: 4 },
    });
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(wasSubmittedThisSession('CMP-2026-00042')).toBe(true);
  });

  it('switches to "already submitted" state on FEEDBACK_ALREADY_SUBMITTED', async () => {
    mockSubmit.mockRejectedValueOnce(
      new ApiError({
        code: 'FEEDBACK_ALREADY_SUBMITTED',
        message: 'dup',
        status: 409,
      }),
    );
    const onSubmitted = vi.fn();
    renderDialog(onSubmitted);

    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: '3' }));
    await user.click(screen.getByRole('button', { name: /^submit feedback$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/we've already received your feedback/i),
      ).toBeInTheDocument();
    });
    expect(wasSubmittedThisSession('CMP-2026-00042')).toBe(true);
    // onSubmitted is intentionally NOT fired on the 409 path itself —
    // it fires when the consumer dismisses the "thanks" state via the
    // Close button.
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});


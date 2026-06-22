/**
 * CloseDialog — 2 tests, per minimum-test policy.
 *
 *  1. Happy path: complaint is NOT SLA-breached → no reason textarea
 *     renders, clicking Close fires useClose mutation with empty body,
 *     `onSuccess` is called.
 *  2. Unhappy path: complaint IS SLA-breached AND BE has no reason on
 *     file → textarea renders as required; submitting blank surfaces
 *     a field-level error and the mutation is NOT called.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CloseDialog } from './CloseDialog';

const mockClose = vi.fn();

beforeEach(() => {
  mockClose.mockReset();
});

vi.mock('@complaints/api', async () => {
  const actual =
    await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useClose: () => ({ mutateAsync: mockClose, isPending: false }),
  };
});

function renderDialog(props: {
  slaBreached: boolean;
  existingSlaBreachReason: string | null;
  onSuccess: () => void;
}): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CloseDialog
        open={true}
        onClose={() => {}}
        complaintId={42}
        slaBreached={props.slaBreached}
        existingSlaBreachReason={props.existingSlaBreachReason}
        onSuccess={props.onSuccess}
      />
    </QueryClientProvider>,
  );
}

describe('CloseDialog', () => {
  it('closes an on-time complaint without asking for a breach reason', async () => {
    mockClose.mockResolvedValueOnce({});
    const onSuccess = vi.fn();
    renderDialog({
      slaBreached: false,
      existingSlaBreachReason: null,
      onSuccess,
    });

    // No breach textarea on the happy path.
    expect(
      screen.queryByLabelText(/sla breach reason/i),
    ).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^close$/i }));

    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledWith({ id: 42, data: {} });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('requires a breach reason when the complaint is breached and BE has none on file', async () => {
    const onSuccess = vi.fn();
    renderDialog({
      slaBreached: true,
      existingSlaBreachReason: null,
      onSuccess,
    });

    const reason = screen.getByLabelText(/sla breach reason/i);
    expect(reason).toBeInTheDocument();

    const user = userEvent.setup();
    // Submit blank → zod min(1) fires, field error appears, mutation
    // is never called.
    await user.click(screen.getByRole('button', { name: /^close$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/a breach reason is required/i),
      ).toBeInTheDocument();
    });
    expect(mockClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});



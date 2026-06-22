/**
 * AssignDialog — 2 tests, per minimum-test policy.
 *
 *  1. Happy path: pick a technician, change severity, submit → useAssign
 *     mutation fires with the expected `{ id, data }` payload and
 *     `onSuccess` is called.
 *  2. Unhappy path: BE returns INVALID_TECHNICIAN → the field-level
 *     error is surfaced under the technician picker and `onSuccess` is
 *     NOT called.
 *
 * The TechnicianPicker is implicitly tested via the mocked `useListStaff`
 * that returns one staff row, so the picker renders one selectable option.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@complaints/api';
import { AssignDialog } from './AssignDialog';

const mockAssign = vi.fn();

vi.mock('@complaints/api', async () => {
  const actual =
    await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useAssign: () => ({ mutateAsync: mockAssign, isPending: false }),
    useListStaff: () => ({
      data: {
        data: {
          success: true,
          data: {
            content: [
              {
                id: 5,
                employeeId: 'TECH001',
                fullName: 'Bob Tech',
                role: 'TECHNICIAN',
                distributionCenterId: 7,
                enabled: true,
              },
            ],
          },
        },
      },
      isLoading: false,
    }),
  };
});

function renderDialog(onSuccess: () => void): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AssignDialog
        open={true}
        onClose={() => {}}
        complaintId={42}
        distributionCenterId={7}
        onSuccess={onSuccess}
      />
    </QueryClientProvider>,
  );
}

describe('AssignDialog', () => {
  it('submits the expected payload and fires onSuccess', async () => {
    mockAssign.mockResolvedValueOnce({});
    const onSuccess = vi.fn();
    renderDialog(onSuccess);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/^technician$/i), '5');
    await user.selectOptions(screen.getByLabelText(/severity/i), 'HIGH');
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    expect(mockAssign).toHaveBeenCalledTimes(1);
    expect(mockAssign).toHaveBeenCalledWith({
      id: 42,
      data: { technicianId: 5, severity: 'HIGH' },
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('surfaces INVALID_TECHNICIAN as a field error and does not fire onSuccess', async () => {
    mockAssign.mockRejectedValueOnce(
      new ApiError({
        code: 'INVALID_TECHNICIAN',
        message: 'wrong dc',
        status: 422,
      }),
    );
    const onSuccess = vi.fn();
    renderDialog(onSuccess);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/^technician$/i), '5');
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    expect(
      (await screen.findAllByText(/pick a technician active in this distribution centre/i))
        .length,
    ).toBeGreaterThan(0);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});


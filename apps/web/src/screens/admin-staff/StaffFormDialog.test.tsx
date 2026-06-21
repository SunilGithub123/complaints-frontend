/**
 * StaffFormDialog — 2 tests, per minimum-test policy.
 *
 *  1. Happy path: filling all required fields + submit → createMutation
 *     fires with the expected payload (incl. subdivisionId from the
 *     signed-in admin's token), and `onCreated` is called with the
 *     temp-password reveal context.
 *  2. Unhappy path: BE returns `EMPLOYEE_ID_TAKEN` → field-level error
 *     appears under "Employee ID" and `onCreated` was NOT called.
 *
 * `useListDcs` is mocked so the DC picker has a deterministic option set.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@complaints/api';
import { StaffFormDialog } from './StaffFormDialog';
import { useAuthStore } from '@/auth/authStore';

vi.mock('@complaints/api', async () => {
  const actual = await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useListDcs: () => ({
      data: {
        data: {
          success: true,
          data: {
            content: [
              { id: 7, code: 'DC-PUNE-01', name: 'Pune Central', active: true },
            ],
          },
        },
      },
      isLoading: false,
      error: null,
    }),
  };
});

function renderDialog(props: {
  onCreated?: ReturnType<typeof vi.fn>;
  createMutateAsync: ReturnType<typeof vi.fn>;
}): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <StaffFormDialog
        open={true}
        initial={null}
        onClose={() => {}}
        onCreated={props.onCreated ?? (() => {})}
        onUpdated={() => {}}
        createMutation={{ mutateAsync: props.createMutateAsync, isPending: false }}
        updateMutation={{ mutateAsync: vi.fn(), isPending: false }}
      />
    </QueryClientProvider>,
  );
}

describe('StaffFormDialog (create)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'r',
      staff: {
        id: 1,
        employeeId: 'ADMIN001',
        fullName: 'Alice Admin',
        role: 'ADMIN',
        subdivisionId: 42,
        passwordResetRequired: false,
      },
    });
  });

  it('submits a valid TECHNICIAN payload and reveals the temp password', async () => {
    const createMutateAsync = vi.fn().mockResolvedValueOnce({
      data: {
        success: true,
        data: { id: 99, employeeId: 'TECH123', temporaryPassword: 'TempP@ss-XYZ-9' },
      },
    });
    const onCreated = vi.fn();
    renderDialog({ createMutateAsync, onCreated });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/employee id/i), 'TECH123');
    await user.type(screen.getByLabelText(/full name/i), 'Tech User');
    // Role defaults to TECHNICIAN — DC picker is therefore visible.
    await user.selectOptions(screen.getByLabelText(/distribution centre/i), '7');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(createMutateAsync).toHaveBeenCalledWith({
      data: {
        employeeId: 'TECH123',
        fullName: 'Tech User',
        role: 'TECHNICIAN',
        subdivisionId: 42,
        distributionCenterId: 7,
      },
    });
    expect(onCreated).toHaveBeenCalledWith({
      employeeId: 'TECH123',
      fullName: 'Tech User',
      temporaryPassword: 'TempP@ss-XYZ-9',
    });
  });

  it('renders EMPLOYEE_ID_TAKEN as a field error and does not reveal a password', async () => {
    const createMutateAsync = vi.fn().mockRejectedValueOnce(
      new ApiError({ code: 'EMPLOYEE_ID_TAKEN', message: 'dup', status: 409 }),
    );
    const onCreated = vi.fn();
    renderDialog({ createMutateAsync, onCreated });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/employee id/i), 'TECH123');
    await user.type(screen.getByLabelText(/full name/i), 'Tech User');
    await user.selectOptions(screen.getByLabelText(/distribution centre/i), '7');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(
      (await screen.findAllByText(/employee id is already in use/i)).length,
    ).toBeGreaterThan(0);
    expect(onCreated).not.toHaveBeenCalled();
  });
});


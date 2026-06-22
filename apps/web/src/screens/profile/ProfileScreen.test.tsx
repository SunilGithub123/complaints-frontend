/**
 * ProfileScreen — 2 tests, per minimum-test policy.
 *
 *  1. Happy: valid submit → useUpdateMyProfile fires with the expected
 *     payload; the auth store is updated via setValidatedStaff with
 *     the response's fresh StaffSummaryResponse; success toast renders.
 *  2. Unhappy: BE returns 400 VALIDATION_FAILED with `details.email`
 *     populated → field-level error appears under Email and the store
 *     stays untouched.
 *
 * `useUpdateMyProfile` is module-mocked; `useGetSubdivision` / `useGetDc`
 * are stubbed so the header has a deterministic resolved name.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@complaints/api';
import ProfileScreen from './ProfileScreen';
import { useAuthStore } from '@/auth/authStore';
import { ToastViewport } from '@/components/ui/toast';

const updateMutateAsync = vi.fn();

vi.mock('@complaints/api', async () => {
  const actual = await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useUpdateMyProfile: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
    useGetSubdivision: () => ({
      data: {
        data: { success: true, data: { id: 42, code: 'PUN', name: 'Pune' } },
      },
    }),
    useGetDc: () => ({
      data: {
        data: { success: true, data: { id: 7, code: 'DC-PUNE-01', name: 'Pune Central' } },
      },
    }),
  };
});

function renderScreen(): void {
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfileScreen />
      <ToastViewport />
    </MemoryRouter>,
  );
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    updateMutateAsync.mockReset();
    useAuthStore.setState({
      accessToken: 'a',
      refreshToken: 'r',
      staff: {
        id: 5,
        employeeId: 'ENG010',
        fullName: 'Eve Engineer',
        role: 'ENGINEER',
        subdivisionId: 42,
        distributionCenterId: 7,
        passwordResetRequired: false,
        notificationsPushEnabled: false,
      },
      lastValidatedAt: 1,
    });
  });

  it('submits a valid update, commits the fresh staff via setValidatedStaff and toasts', async () => {
    updateMutateAsync.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 5,
          employeeId: 'ENG010',
          fullName: 'Eve E. Engineer',
          role: 'ENGINEER',
          subdivisionId: 42,
          distributionCenterId: 7,
          passwordResetRequired: false,
          notificationsPushEnabled: true,
        },
      },
    });

    renderScreen();

    const user = userEvent.setup();
    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Eve E. Engineer');
    await user.click(screen.getByLabelText(/push notifications/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(updateMutateAsync).toHaveBeenCalledTimes(1);
    expect(updateMutateAsync).toHaveBeenCalledWith({
      data: {
        fullName: 'Eve E. Engineer',
        notificationsPushEnabled: true,
      },
    });
    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
    const after = useAuthStore.getState().staff;
    expect(after?.fullName).toBe('Eve E. Engineer');
    expect(after?.notificationsPushEnabled).toBe(true);
  });

  it('renders BE field error on VALIDATION_FAILED and leaves the auth store untouched', async () => {
    updateMutateAsync.mockRejectedValueOnce(
      new ApiError({
        code: 'VALIDATION_FAILED',
        message: 'invalid fields',
        status: 400,
        fieldErrors: { email: 'must be a valid email' },
      }),
    );

    renderScreen();

    const user = userEvent.setup();
    // Use an address that passes zod's client-side `.email()` check —
    // we want the BE rejection path, not a client-validation short-circuit.
    await user.type(screen.getByLabelText(/email/i), 'taken@example.test');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText(/must be a valid email/i),
    ).toBeInTheDocument();
    // Store should not have been mutated.
    expect(useAuthStore.getState().staff?.fullName).toBe('Eve Engineer');
  });
});



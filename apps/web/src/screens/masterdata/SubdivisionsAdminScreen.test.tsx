/**
 * SubdivisionsAdminScreen — 1 test for the SUBDIVISION_HAS_ACTIVE_DCS
 * guardrail. The BE refuses to deactivate a subdivision that still has
 * active distribution centres; we render that as a warning toast and
 * leave the row's state alone (the list is invalidated regardless;
 * here we just assert the toast text appears).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@complaints/api';
import SubdivisionsAdminScreen from './SubdivisionsAdminScreen';
import { ToastViewport } from '@/components/ui/toast';

const deactivateMutateAsync = vi.fn();
const activateMutateAsync = vi.fn();

vi.mock('@complaints/api', async () => {
  const actual = await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useListSubdivisions: () => ({
      data: {
        data: {
          success: true,
          data: {
            content: [
              { id: 1, code: 'PUN', name: 'Pune', district: 'Pune', active: true },
            ],
            totalPages: 1,
          },
        },
      },
      isLoading: false,
      error: null,
    }),
    useCreateSubdivision: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateSubdivision: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useActivateSubdivision: () => ({
      mutateAsync: activateMutateAsync,
      isPending: false,
    }),
    useDeactivateSubdivision: () => ({
      mutateAsync: deactivateMutateAsync,
      isPending: false,
    }),
    getListSubdivisionsQueryKey: () => ['list-subdivisions'],
  };
});

function renderScreen(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SubdivisionsAdminScreen />
        <ToastViewport />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SubdivisionsAdminScreen', () => {
  beforeEach(() => {
    deactivateMutateAsync.mockReset();
    activateMutateAsync.mockReset();
  });

  it('surfaces SUBDIVISION_HAS_ACTIVE_DCS as a warning toast on deactivate', async () => {
    deactivateMutateAsync.mockRejectedValueOnce(
      new ApiError({
        code: 'SUBDIVISION_HAS_ACTIVE_DCS',
        message: 'has dcs',
        status: 409,
      }),
    );

    renderScreen();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /deactivate/i }));

    expect(deactivateMutateAsync).toHaveBeenCalledWith({ id: 1 });
    expect(
      await screen.findByText(/still has active distribution centres/i),
    ).toBeInTheDocument();
  });
});


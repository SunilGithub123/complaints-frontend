/**
 * TrackingListScreen — 2 tests, per minimum-test policy.
 *
 *  1. Happy: renders one row from a mocked list response, status badge
 *     visible, ticket link points at the detail route.
 *  2. Unhappy: BE error → maps to a destructive alert.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@complaints/api';
import TrackingListScreen from './TrackingListScreen';

const mockList = vi.fn();

vi.mock('@/features/consumer/trackingApi', () => ({
  useConsumerComplaintsList: (...args: unknown[]) => mockList(...args),
}));

function renderScreen(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/consumer/my-complaints']}>
        <TrackingListScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TrackingListScreen', () => {
  it('renders a tracked complaint row with status badge and detail link', () => {
    mockList.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        data: {
          success: true,
          data: {
            content: [
              {
                id: 1,
                ticketNo: 'CMP-2026-00042',
                status: 'IN_PROGRESS',
                slaBreached: false,
                submittedAt: '2026-06-22T10:00:00Z',
                slaDeadline: '2026-06-25T10:00:00Z',
                feedbackSubmitted: false,
              },
            ],
            page: 0,
            size: 20,
            totalElements: 1,
            totalPages: 1,
          },
        },
      },
    });

    renderScreen();

    expect(screen.getByText('CMP-2026-00042')).toBeInTheDocument();
    // Status appears in the filter dropdown options AND in the row
    // badge — narrow to the row badge by checking the cell role.
    const cells = screen.getAllByRole('cell');
    expect(cells.some((c) => /in progress/i.test(c.textContent ?? ''))).toBe(true);
    const link = screen.getByRole('link', { name: 'CMP-2026-00042' });
    expect(link.getAttribute('href')).toBe(
      '/consumer/my-complaints/CMP-2026-00042',
    );
  });

  it('surfaces a BE error as a destructive alert', () => {
    mockList.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new ApiError({
        code: 'COMPLAINT_NOT_FOUND',
        message: 'nope',
        status: 500,
      }),
      data: undefined,
    });

    renderScreen();

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});



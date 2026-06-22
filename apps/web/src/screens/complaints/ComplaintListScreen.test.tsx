/**
 * ComplaintListScreen — 2 tests, per minimum-test policy.
 *
 *  1. Happy path: 2 rows render with resolved assignee names from
 *     the staff-directory batch, plus a status + SLA-breached badge,
 *     plus a clickable ticket link to the detail route.
 *  2. Unhappy path: 403 from `/staff/complaints` renders the friendly
 *     "filter outside your area" alert (per BE Stage 16 handoff) and
 *     hits console.warn for the stale filter state.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@complaints/api';
import ComplaintListScreen from './ComplaintListScreen';
import { useAuthStore } from '@/auth/authStore';

const mockList = vi.fn();

vi.mock('@/features/complaints/listApi', () => ({
  useStaffComplaintsList: (...args: unknown[]) => mockList(...args),
}));

vi.mock('@/features/staffDirectory/api', () => ({
  useStaffDirectoryByIds: () => ({
    data: {
      data: {
        success: true,
        data: [
          {
            userId: 11,
            fullName: 'Alice Engineer',
            employeeId: 'ENG001',
            enabled: true,
          },
          {
            userId: 22,
            fullName: 'Bob Tech',
            employeeId: 'TECH009',
            enabled: true,
          },
        ],
      },
    },
    isLoading: false,
  }),
}));

function renderScreen(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ComplaintListScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ComplaintListScreen', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'tok',
      refreshToken: 'r',
      staff: {
        id: 1,
        employeeId: 'ENG001',
        fullName: 'Alice Engineer',
        role: 'ENGINEER',
        subdivisionId: 1,
        distributionCenterId: 7,
        passwordResetRequired: false,
      },
    });
  });

  it('renders rows with resolved assignee names and a ticket link', () => {
    mockList.mockReturnValue({
      data: {
        data: {
          success: true,
          data: {
            content: [
              {
                id: 100,
                ticketNo: 'CMP-2026-00100',
                status: 'ASSIGNED',
                severity: 'MEDIUM',
                slaBreached: false,
                categoryId: 3,
                distributionCenterId: 7,
                assignedEngineerId: 11,
                assignedTechnicianId: 22,
                submittedAt: '2026-06-22T03:00:00Z',
                slaDeadline: '2026-06-23T03:00:00Z',
              },
              {
                id: 101,
                ticketNo: 'CMP-2026-00101',
                status: 'SUBMITTED',
                severity: 'HIGH',
                slaBreached: true,
                categoryId: 3,
                distributionCenterId: 7,
                submittedAt: '2026-06-22T04:00:00Z',
                slaDeadline: '2026-06-22T05:00:00Z',
              },
            ],
            totalPages: 1,
          },
        },
      },
      isLoading: false,
      isError: false,
    });

    renderScreen();

    expect(screen.getByText('CMP-2026-00100')).toBeInTheDocument();
    expect(screen.getByText('CMP-2026-00100').closest('a')).toHaveAttribute(
      'href',
      '/complaints/100',
    );
    // Both assignee chips resolved via the staff-directory mock.
    expect(screen.getByText(/Alice Engineer \(ENG001\)/)).toBeInTheDocument();
    expect(screen.getByText(/Bob Tech \(TECH009\)/)).toBeInTheDocument();
    // SLA-breached row on row 2. "Breached" also appears in the
    // filter label ("SLA breached") so assert on cardinality.
    expect(screen.getAllByText(/breached/i).length).toBeGreaterThan(1);
  });

  it('renders the friendly out-of-scope alert on 403 + warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockList.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError({
        code: 'COMPLAINT_OUT_OF_SCOPE',
        message: 'out of scope',
        status: 403,
      }),
    });

    renderScreen();

    expect(screen.getByText(/filter outside your area/i)).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[complaints/list] 403'),
    );
    warn.mockRestore();
  });
});


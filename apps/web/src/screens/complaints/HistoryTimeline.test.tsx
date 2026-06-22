/**
 * HistoryTimeline — 2 tests, per minimum-test policy.
 *
 *  1. Happy path (BE Stage 14.5 wiring): renders "by {fullName}
 *     ({employeeId})" for resolved actors, "by system" for the null
 *     scheduler row, and the bare "by user #{id}" fallback for ids
 *     the batch silently dropped (hard-deleted user).
 *  2. Empty path: no entries → renders the "no history yet" copy.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HistoryTimeline } from './HistoryTimeline';

vi.mock('@complaints/api', async () => {
  const actual =
    await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    // Batch returns 2 of the 3 requested ids — id 99 is "dropped",
    // exercising the unknown-user fallback branch.
    useGetStaffDirectoryMany: () => ({
      data: {
        data: {
          success: true,
          data: [
            {
              userId: 7,
              employeeId: 'ENG001',
              fullName: 'Alice Engineer',
              role: 'ENGINEER',
              enabled: true,
            },
            {
              userId: 8,
              employeeId: 'TECH009',
              fullName: 'Bob Tech',
              role: 'TECHNICIAN',
              enabled: true,
            },
          ],
        },
      },
      isLoading: false,
    }),
  };
});

function renderWith(entries: unknown[]): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- test shim */}
      <HistoryTimeline entries={entries as any} />
    </QueryClientProvider>,
  );
}

describe('HistoryTimeline', () => {
  it('renders resolved names, the system row, and the unknown-user fallback', () => {
    renderWith([
      {
        id: 1,
        fromStatus: null,
        toStatus: 'SUBMITTED',
        changedByUserId: 7,
        changedAt: '2026-06-22T03:00:00Z',
      },
      {
        id: 2,
        fromStatus: 'SUBMITTED',
        toStatus: 'ASSIGNED',
        changedByUserId: 8,
        changedAt: '2026-06-22T03:10:00Z',
        note: 'Routed to nearest tech.',
      },
      {
        id: 3,
        fromStatus: 'ASSIGNED',
        toStatus: 'IN_PROGRESS',
        // null = system-driven (Stage 15 SLA scheduler etc.).
        changedByUserId: null,
        changedAt: '2026-06-22T03:20:00Z',
      },
      {
        id: 4,
        fromStatus: 'IN_PROGRESS',
        toStatus: 'RESOLVED',
        // 99 is not in the mocked batch response → BE silently dropped
        // it → render the bare user-id fallback.
        changedByUserId: 99,
        changedAt: '2026-06-22T03:30:00Z',
      },
    ]);

    expect(screen.getByText(/by Alice Engineer \(ENG001\)/)).toBeInTheDocument();
    expect(screen.getByText(/by Bob Tech \(TECH009\)/)).toBeInTheDocument();
    expect(screen.getByText(/by system/i)).toBeInTheDocument();
    expect(screen.getByText(/by user #99/)).toBeInTheDocument();
    expect(screen.getByText('Routed to nearest tech.')).toBeInTheDocument();
  });

  it('renders the empty-history copy when there are no entries', () => {
    renderWith([]);
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
  });
});


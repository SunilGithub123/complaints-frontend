/**
 * ComplaintDetailScreen — 4 tests, per minimum-test policy.
 *
 *  1. Happy path: SUBMITTED complaint renders ticket no + status badge
 *     and exposes the Assign / Reject / Mark-as-duplicate actions (and
 *     NOT Reassign / Update-severity / Close, which belong to later
 *     statuses).
 *  2. Unhappy path: 403 from `useGetStaffComplaintById` renders the
 *     friendly "outside your area" empty state, NOT a hard error. Per
 *     BE Stage 13.5 handoff: `COMPLAINT_OUT_OF_SCOPE` is expected when
 *     an engineer/admin opens a complaint outside their scope.
 *  3. Image gallery (Stage 12.2): non-empty `images[]` renders a
 *     thumbnail per row, sorted chronologically by `uploadedAt`.
 *  4. RESOLVED status exposes the Close action button (Stage 14 BE).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@complaints/api';
import ComplaintDetailScreen from './ComplaintDetailScreen';

const mockDetail = vi.fn();
const mockHistory = vi.fn();

vi.mock('@complaints/api', async () => {
  const actual =
    await vi.importActual<typeof import('@complaints/api')>('@complaints/api');
  return {
    ...actual,
    useGetStaffComplaintById: (...args: unknown[]) => mockDetail(...args),
    useGetStaffComplaintHistory: (...args: unknown[]) => mockHistory(...args),
  };
});

// HistoryTimeline + TechnicianPicker each call into the staff-directory
// feature hooks. Both tests pass an empty history + the dialogs are
// never opened, so the picker never fires either — but we still stub
// them so the real transport is never reached if the test scope grows.
vi.mock('@/features/staffDirectory/api', () => ({
  useStaffDirectoryByIds: () => ({ data: undefined, isLoading: false }),
  useStaffDirectorySearch: () => ({ data: undefined, isLoading: false }),
}));

function renderAt(id: number): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/complaints/${id}`]}>
        <Routes>
          <Route path="/complaints/:id" element={<ComplaintDetailScreen />} />
          <Route path="/complaints" element={<div>LOOKUP</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ComplaintDetailScreen', () => {
  it('renders SUBMITTED detail with assign / reject / duplicate actions', () => {
    mockDetail.mockReturnValue({
      data: {
        data: {
          success: true,
          data: {
            id: 42,
            ticketNo: 'CMP-2026-00042',
            status: 'SUBMITTED',
            severity: 'MEDIUM',
            description: 'No power since morning.',
            distributionCenterId: 7,
            categoryId: 3,
            slaBreached: false,
            version: 1,
          },
        },
      },
      isLoading: false,
      isError: false,
    });
    mockHistory.mockReturnValue({
      data: { data: { success: true, data: [] } },
      isLoading: false,
    });

    renderAt(42);

    expect(screen.getByText('CMP-2026-00042')).toBeInTheDocument();
    // "Submitted" appears both as the status badge and the dl field label;
    // either is fine — we just want >=1.
    expect(screen.getAllByText(/submitted/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /^assign$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^reject$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /mark as duplicate/i }),
    ).toBeInTheDocument();
    // Reassign / severity belong to post-assignment statuses.
    expect(
      screen.queryByRole('button', { name: /^reassign$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /update severity/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the friendly out-of-scope empty state on 403', () => {
    mockDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError({
        code: 'COMPLAINT_OUT_OF_SCOPE',
        message: 'out of scope',
        status: 403,
      }),
    });
    mockHistory.mockReturnValue({ data: undefined, isLoading: false });

    renderAt(99);

    expect(screen.getByText(/outside your area/i)).toBeInTheDocument();
    // Critically: NOT a destructive alert.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /back to complaints/i }),
    ).toBeInTheDocument();
  });

  it('renders the image gallery chronologically when images are attached', () => {
    mockDetail.mockReturnValue({
      data: {
        data: {
          success: true,
          data: {
            id: 7,
            ticketNo: 'CMP-2026-00007',
            status: 'IN_PROGRESS',
            severity: 'LOW',
            slaBreached: false,
            distributionCenterId: 7,
            categoryId: 1,
            images: [
              {
                id: 2,
                url: 'https://signed/two.jpg',
                contentType: 'image/jpeg',
                uploadedAt: '2026-06-22T05:00:00Z',
              },
              {
                id: 1,
                url: 'https://signed/one.jpg',
                contentType: 'image/jpeg',
                uploadedAt: '2026-06-22T03:00:00Z',
              },
            ],
            version: 1,
          },
        },
      },
      isLoading: false,
      isError: false,
    });
    mockHistory.mockReturnValue({
      data: { data: { success: true, data: [] } },
      isLoading: false,
    });

    renderAt(7);

    const gallery = screen.getByTestId('complaint-gallery');
    const thumbs = gallery.querySelectorAll('img');
    expect(thumbs).toHaveLength(2);
    // Sorted ascending by uploadedAt → "one.jpg" (03:00Z) first.
    expect(thumbs[0]?.getAttribute('src')).toBe('https://signed/one.jpg');
    expect(thumbs[1]?.getAttribute('src')).toBe('https://signed/two.jpg');
    expect(thumbs[0]?.getAttribute('loading')).toBe('lazy');
  });

  it('exposes the Close action on RESOLVED complaints', () => {
    mockDetail.mockReturnValue({
      data: {
        data: {
          success: true,
          data: {
            id: 11,
            ticketNo: 'CMP-2026-00011',
            status: 'RESOLVED',
            severity: 'MEDIUM',
            slaBreached: false,
            distributionCenterId: 7,
            categoryId: 1,
            assignedTechnicianId: 22,
            version: 1,
          },
        },
      },
      isLoading: false,
      isError: false,
    });
    mockHistory.mockReturnValue({
      data: { data: { success: true, data: [] } },
      isLoading: false,
    });

    renderAt(11);

    expect(
      screen.getByRole('button', { name: /^close$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^reassign$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /update severity/i }),
    ).toBeInTheDocument();
    // SUBMITTED-only actions must NOT appear.
    expect(
      screen.queryByRole('button', { name: /^assign$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^reject$/i }),
    ).not.toBeInTheDocument();
  });
});


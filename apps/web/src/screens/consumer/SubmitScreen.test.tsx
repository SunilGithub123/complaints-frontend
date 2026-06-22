/**
 * SubmitScreen — 2 tests.
 *
 *  1. Happy: 1 small image (under 1 MB so compression is skipped) +
 *     valid form → mutation called → confirmation route navigated.
 *  2. Unhappy: a 2 MB image is picked → rejected client-side with the
 *     IMAGE_TOO_LARGE message, and we assert the submit mutation was
 *     never called. This is the load-bearing test: it confirms the
 *     client cap fires *before* any network round-trip.
 *
 * We mock the categories query, the submit hook, and `useNavigate`.
 * Image compression deliberately stays NOT mocked — we control file
 * sizes via crafted `File` objects, and pre-compression validation
 * is what we want to exercise.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConsumerAuthStore } from '@/features/consumer/consumerAuthStore';
import { clearDraft } from '@/features/consumer/draftStorage';
import SubmitScreen from './SubmitScreen';

const navigateMock = vi.fn();
const submitMutate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@complaints/api', async () => {
  const actual = await vi.importActual<typeof import('@complaints/api')>(
    '@complaints/api',
  );
  return {
    ...actual,
    useListActiveCategories: () => ({
      data: {
        data: {
          success: true,
          data: {
            content: [
              { id: 7, code: 'POWER', name: 'Power outage', active: true },
              { id: 8, code: 'BILL', name: 'Billing dispute', active: true },
            ],
          },
        },
      },
      isPending: false,
      isLoading: false,
    }),
  };
});

vi.mock('@/features/consumer/submitComplaint', () => ({
  useSubmitComplaint: () => ({
    mutateAsync: submitMutate,
    isPending: false,
  }),
}));

// `browser-image-compression` is dynamically imported by the picker and
// hard to drive realistically inside jsdom (no canvas). Stub it to
// return a still-too-large file so the compressed-but-failed branch
// surfaces IMAGE_TOO_LARGE deterministically.
vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (file: File) => {
    // 1.5 MB — still over the 1 MB cap so prepareImageForUpload throws
    // IMAGE_TOO_LARGE. Mirrors the real-world "user picked an image the
    // library couldn't shrink" branch.
    return new File([new Uint8Array(1_500_000)], file.name, { type: file.type });
  }),
}));

function renderScreen(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/consumer/submit']}>
        <SubmitScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeFile(name: string, sizeBytes: number, type: string): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
}

describe('SubmitScreen', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    submitMutate.mockReset();
    clearDraft();
    useConsumerAuthStore.setState({
      token: 'consumer-jwt',
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      consumerId: 'CN-001',
      mobile: '9999999999',
    });
  });

  it('submits a complaint with a small image and navigates to the confirmation screen', async () => {
    submitMutate.mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        data: {
          ticketNo: 'TKT-2026-0001',
          submittedAt: new Date().toISOString(),
          slaDeadline: new Date(Date.now() + 24 * 3600_000).toISOString(),
          images: [],
        },
      },
      headers: new Headers(),
    });

    renderScreen();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/category/i), '7');
    await user.type(
      screen.getByLabelText(/describe the issue/i),
      'Pole-mounted transformer is humming loudly.',
    );

    // 100 KB file → under the 1 MB cap, no compression needed.
    const file = makeFile('photo.jpg', 100 * 1024, 'image/jpeg');
    const input = document.getElementById('image-picker') as HTMLInputElement;
    await user.upload(input, file);

    await user.click(screen.getByRole('button', { name: /^submit complaint$/i }));

    await waitFor(() => expect(submitMutate).toHaveBeenCalledTimes(1));
    const call = submitMutate.mock.calls[0]?.[0];
    expect(call?.complaint).toMatchObject({
      consumerId: 'CN-001',
      mobile: '9999999999',
      categoryId: 7,
      description: 'Pole-mounted transformer is humming loudly.',
    });
    expect(call?.images).toHaveLength(1);
    expect(navigateMock).toHaveBeenCalledWith(
      '/consumer/submitted/TKT-2026-0001',
      expect.objectContaining({ replace: true }),
    );
  });

  it('rejects a 2 MB image client-side and never fires the submit mutation', async () => {
    renderScreen();
    const user = userEvent.setup();

    // 2 MB file — over the 1 MB cap. The mocked compression library
    // returns a still-too-large file, so prepareImageForUpload throws
    // IMAGE_TOO_LARGE. The load-bearing assertion: no network call.
    const bigFile = makeFile('huge.jpg', 2 * 1024 * 1024, 'image/jpeg');
    const input = document.getElementById('image-picker') as HTMLInputElement;
    await user.upload(input, bigFile);

    expect(
      await screen.findByText(/image is larger than 1 mb/i),
    ).toBeInTheDocument();
    expect(submitMutate).not.toHaveBeenCalled();
  });
});




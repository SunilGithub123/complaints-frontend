/**
 * Hand-rolled staff-directory wrappers (BE Stage 14.5 + Stage 16).
 *
 * The generated `useSearch` in `@complaints/api` has the same nested-
 * `pageable` URL-builder bug as the complaint list hooks (see
 * `features/complaints/listApi.ts` doc) — orval emits
 * `?pageable=[object Object]` which Spring quietly drops back to
 * defaults. That's fine for the batch-by-ids path (we never paginate
 * a 50-id batch) but it breaks the search-by-DC path the
 * TechnicianPicker now relies on.
 *
 * Two public hooks:
 *  - `useStaffDirectoryByIds(ids)` — batch lookup, BE silently drops
 *    unknown ids; treat the response as a partial map keyed by
 *    `userId`.
 *  - `useStaffDirectorySearch({...})` — filter by role / DC / active,
 *    paged. Used by `TechnicianPicker` (role=TECHNICIAN + DC) and
 *    available for any other "list staff in scope" need that doesn't
 *    require the ADMIN-only `/admin/staff` lifecycle surface.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { customFetch, type Schemas } from '@complaints/api';

const BASE = '/api/v1/staff/users';

export interface StaffDirectorySearchArgs {
  role?: 'ADMIN' | 'ENGINEER' | 'TECHNICIAN';
  distributionCenterId?: number;
  active?: boolean;
  page?: number;
  size?: number;
  sort?: string[];
}

export type StaffDirectoryListResponse = {
  data?: Schemas.ApiResponseListStaffDirectoryEntryResponse;
};

// --- Helpers ---------------------------------------------------------

function buildBatchUrl(ids: readonly number[]): string {
  const q = new URLSearchParams();
  for (const id of ids) q.append('ids', String(id));
  return `${BASE}?${q.toString()}`;
}

function buildSearchUrl(args: StaffDirectorySearchArgs): string {
  const q = new URLSearchParams();
  if (args.role) q.append('role', args.role);
  if (typeof args.distributionCenterId === 'number')
    q.append('distributionCenterId', String(args.distributionCenterId));
  if (typeof args.active === 'boolean') q.append('active', String(args.active));
  if (typeof args.page === 'number') q.append('page', String(args.page));
  if (typeof args.size === 'number') q.append('size', String(args.size));
  for (const s of args.sort ?? []) q.append('sort', s);
  const s = q.toString();
  return s ? `${BASE}?${s}` : BASE;
}

// --- Fetchers (exported for prefetch / non-React use) ---------------

export function fetchStaffDirectoryByIds(
  ids: readonly number[],
): Promise<StaffDirectoryListResponse> {
  return customFetch<StaffDirectoryListResponse>(buildBatchUrl(ids), {
    method: 'GET',
  });
}

export function fetchStaffDirectorySearch(
  args: StaffDirectorySearchArgs,
): Promise<StaffDirectoryListResponse> {
  return customFetch<StaffDirectoryListResponse>(buildSearchUrl(args), {
    method: 'GET',
  });
}

// --- React hooks ----------------------------------------------------

/**
 * Batch lookup. Caller passes a `number[]`; we sort it inside the
 * query key so two callers asking for the same set in different
 * orders share the same cache entry.
 */
export function useStaffDirectoryByIds(
  ids: readonly number[],
  options?: { enabled?: boolean; staleTime?: number },
): UseQueryResult<StaffDirectoryListResponse, unknown> {
  const sorted = [...ids].sort((a, b) => a - b);
  return useQuery({
    queryKey: [BASE, 'byIds', sorted] as const,
    queryFn: () => fetchStaffDirectoryByIds(sorted),
    enabled: (options?.enabled ?? true) && sorted.length > 0,
    staleTime: options?.staleTime ?? 5 * 60_000,
    retry: false,
  });
}

export function useStaffDirectorySearch(
  args: StaffDirectorySearchArgs,
  options?: { enabled?: boolean; staleTime?: number },
): UseQueryResult<StaffDirectoryListResponse, unknown> {
  return useQuery({
    queryKey: [BASE, 'search', args] as const,
    queryFn: () => fetchStaffDirectorySearch(args),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 60_000,
    retry: false,
  });
}


/**
 * Hand-rolled list hooks for the engineer/admin + technician complaint
 * tables (BE Stage 16).
 *
 * Why not the generated `useSearchStaffComplaints` /
 * `useListTechnicianComplaints`?
 *
 *   orval's URL builder calls `.toString()` on every top-level param.
 *   `SearchStaffComplaintsParams` has nested `filters` + `pageable`
 *   objects, so the generated client emits
 *   `?filters=[object Object]&pageable=[object Object]` — Spring quietly
 *   falls back to `page=0, size=20` defaults (the same bug already
 *   silently affects `useListStaff` — pre-Stage 16 that screen only ever
 *   needed the first page so it didn't bite).
 *
 *   Fixing orval is upstream work; for now we serialise the URL by
 *   hand the way Spring's `PageableHandlerMethodArgumentResolver`
 *   expects (`page=&size=&sort=…&sort=…`) and append every defined
 *   filter field as a flat query param.
 *
 * Trust boundary: both routes go through the staff transport in
 * `customFetch` (URL-routed token selection in
 * `packages/api/src/client.ts`).
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { customFetch, type Schemas } from '@complaints/api';

export type ComplaintFilters = Schemas.ComplaintSearchRequest;

export interface ComplaintListPage {
  pageable: Schemas.Pageable;
  filters: ComplaintFilters;
}

const STAFF_LIST_BASE = '/api/v1/staff/complaints';
const TECHNICIAN_LIST_BASE = '/api/v1/technician/complaints';

function appendFilters(
  q: URLSearchParams,
  filters: ComplaintFilters | undefined,
): void {
  if (!filters) return;
  for (const [key, raw] of Object.entries(filters)) {
    if (raw === undefined || raw === null || raw === '') continue;
    q.append(key, String(raw));
  }
}

function appendPageable(q: URLSearchParams, p: Schemas.Pageable): void {
  if (typeof p.page === 'number') q.append('page', String(p.page));
  if (typeof p.size === 'number') q.append('size', String(p.size));
  for (const s of p.sort ?? []) q.append('sort', s);
}

function buildQuery(base: string, params: ComplaintListPage): string {
  const q = new URLSearchParams();
  appendFilters(q, params.filters);
  appendPageable(q, params.pageable);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export type ComplaintListResponse = {
  data?: Schemas.ApiResponsePageResponseComplaintListItemResponse;
};

/** Engineer / Admin: `GET /api/v1/staff/complaints`. */
export function listStaffComplaints(
  params: ComplaintListPage,
): Promise<ComplaintListResponse> {
  return customFetch<ComplaintListResponse>(buildQuery(STAFF_LIST_BASE, params), {
    method: 'GET',
  });
}

/** Technician: `GET /api/v1/technician/complaints`. */
export function listTechnicianComplaints(
  params: ComplaintListPage,
): Promise<ComplaintListResponse> {
  return customFetch<ComplaintListResponse>(
    buildQuery(TECHNICIAN_LIST_BASE, params),
    { method: 'GET' },
  );
}

// --- TanStack wrappers ------------------------------------------------

/** Stable query key for staff list — used by manual invalidation. */
export function staffComplaintsListKey(params: ComplaintListPage): readonly unknown[] {
  return [STAFF_LIST_BASE, params] as const;
}

export function useStaffComplaintsList(
  params: ComplaintListPage,
  options?: { enabled?: boolean },
): UseQueryResult<ComplaintListResponse, unknown> {
  return useQuery({
    queryKey: staffComplaintsListKey(params),
    queryFn: () => listStaffComplaints(params),
    enabled: options?.enabled ?? true,
    retry: false,
  });
}

export function technicianComplaintsListKey(
  params: ComplaintListPage,
): readonly unknown[] {
  return [TECHNICIAN_LIST_BASE, params] as const;
}

export function useTechnicianComplaintsList(
  params: ComplaintListPage,
  options?: { enabled?: boolean },
): UseQueryResult<ComplaintListResponse, unknown> {
  return useQuery({
    queryKey: technicianComplaintsListKey(params),
    queryFn: () => listTechnicianComplaints(params),
    enabled: options?.enabled ?? true,
    retry: false,
  });
}


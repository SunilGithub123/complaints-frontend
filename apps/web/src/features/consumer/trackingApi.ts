/**
 * Hand-rolled list hook for the consumer tracking screen (BE Stage 17).
 *
 * Why not the generated `useList` from `@complaints/api`?
 *
 *   `ListParams` has a nested `pageable` object. Orval's URL builder
 *   `.toString()`s every top-level param, so the generated client emits
 *   `?pageable=[object Object]&status=…` and Spring silently falls back
 *   to `page=0, size=20` defaults. Same upstream bug as the staff +
 *   technician list endpoints (see `features/complaints/listApi.ts`).
 *
 * Trust boundary: the URL is consumer-scoped (`/api/v1/consumer/…`), so
 * `customFetch`'s URL-routed token selector picks the consumer JWT.
 *
 * Default sort: BE pins `createdAt,desc` server-side as of Stage 17, so
 * we deliberately do NOT append a `sort` param — keeps the URL short
 * and lets the BE bump the default without an FE deploy.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { customFetch, type Schemas } from '@complaints/api';

const CONSUMER_LIST_BASE = '/api/v1/consumer/complaints';

export type ConsumerComplaintStatusFilter = Schemas.ListStatus | undefined;

export interface ConsumerComplaintsListPage {
  page: number;
  size: number;
  status?: ConsumerComplaintStatusFilter;
}

export type ConsumerComplaintsListResponse = {
  data?: Schemas.ApiResponsePageResponseConsumerComplaintListItemResponse;
};

function buildUrl(params: ConsumerComplaintsListPage): string {
  const q = new URLSearchParams();
  q.append('page', String(params.page));
  q.append('size', String(params.size));
  if (params.status) q.append('status', params.status);
  return `${CONSUMER_LIST_BASE}?${q.toString()}`;
}

export function listConsumerComplaints(
  params: ConsumerComplaintsListPage,
): Promise<ConsumerComplaintsListResponse> {
  return customFetch<ConsumerComplaintsListResponse>(buildUrl(params), {
    method: 'GET',
  });
}

export function consumerComplaintsListKey(
  params: ConsumerComplaintsListPage,
): readonly unknown[] {
  return [CONSUMER_LIST_BASE, params] as const;
}

export function useConsumerComplaintsList(
  params: ConsumerComplaintsListPage,
  options?: { enabled?: boolean },
): UseQueryResult<ConsumerComplaintsListResponse, unknown> {
  return useQuery({
    queryKey: consumerComplaintsListKey(params),
    queryFn: () => listConsumerComplaints(params),
    enabled: options?.enabled ?? true,
    retry: false,
  });
}


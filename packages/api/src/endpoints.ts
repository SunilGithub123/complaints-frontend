/**
 * Manual barrel for the orval-generated, tags-split TanStack Query hooks.
 *
 * Orval (in `mode: 'tags-split'`) emits one file per OpenAPI tag under
 * `./generated/<tag-slug>/<tag-slug>.ts` and does NOT produce a top-level
 * barrel. This file re-exports them so consumers can do:
 *
 *     import { useLoginStaff, useGetMyStaffProfile } from '@complaints/api';
 *
 * If a new tag is added to the OpenAPI spec, add a `export *` line here
 * after regenerating. This is the only hand-maintained surface bridging
 * generated code to package consumers.
 *
 * As of Stage 21.2.1 the BE assigns intention-revealing `operationId`s to
 * every endpoint (e.g. `loginStaff`, `useGetMyStaffProfile`,
 * `useListDistributionCenters`, `useCloseComplaint`,
 * `useRegisterConsumerDevice`). That makes numeric-suffix collisions
 * (`useList1`, `useClose1`) and the alias-renaming dance below obsolete:
 * the generated names are the friendly names. New tags only need a single
 * `export *` line here.
 *
 * Hand-rolled wrappers still bypass the orval `?pageable=[object Object]`
 * upstream bug for the four paged list endpoints
 * (`searchStaffComplaints`, `listTechnicianComplaints`,
 * `listConsumerComplaints`, `getStaffDirectoryEntries`). Those live in
 * `apps/web/src/features/<feature>/api.ts` and consume `customFetch` directly.
 */

export * from './generated/staff-auth/staff-auth';
export * from './generated/master-data-read/master-data-read';
export * from './generated/master-data-admin-—-subdivisions/master-data-admin-—-subdivisions';
export * from './generated/master-data-admin-—-distribution-centers/master-data-admin-—-distribution-centers';
export * from './generated/master-data-admin-—-categories/master-data-admin-—-categories';
export * from './generated/admin-staff/admin-staff';
export * from './generated/consumer-auth/consumer-auth';
export * from './generated/consumer-master-data-read/consumer-master-data-read';
// `useSubmitComplaint` from this module is intentionally NOT used directly
// by the web app — the generated multipart helper appends the `complaint`
// part as a plain string (BE then sees `Content-Type: text/plain` and 400s
// the request). The app calls a hand-rolled `submitComplaintMultipart` in
// `apps/web/src/features/consumer/submitComplaint.ts` that wraps the JSON
// body in a `Blob` with `type: 'application/json'`. Other consumer
// hooks (`useGetConsumerComplaint`, `useCancelComplaint`,
// `useSubmitFeedback`, `useGetFeedback`, `useGetConsumerComplaintHistory`)
// are safe.
//
// `useListConsumerComplaints` is bypassed by
// `apps/web/src/features/consumer/trackingApi.ts` (pageable bug).
export * from './generated/consumer-complaints/consumer-complaints';
// `useSearchStaffComplaints` is bypassed by
// `apps/web/src/features/complaints/listApi.ts` (pageable bug). All other
// hooks (assign, reassign, severity, reject, mark-duplicate, close,
// get-by-id, history) are safe to use directly.
export * from './generated/staff-complaint-management/staff-complaint-management';
// `useListTechnicianComplaints` is bypassed by
// `apps/web/src/features/complaints/listApi.ts` (pageable bug).
export * from './generated/technician-complaints/technician-complaints';
// `useGetStaffDirectoryEntries` is bypassed by
// `apps/web/src/features/staffDirectory/api.ts` (pageable bug).
// `useGetStaffDirectoryEntry` (single id) is safe.
export * from './generated/staff-directory/staff-directory';
export * from './generated/staff-devices/staff-devices';
export * from './generated/consumer-devices/consumer-devices';

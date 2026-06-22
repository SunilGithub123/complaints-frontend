/**
 * Manual barrel for the orval-generated, tags-split TanStack Query hooks.
 *
 * Orval (in `mode: 'tags-split'`) emits one file per OpenAPI tag under
 * `./generated/<tag-slug>/<tag-slug>.ts` and does NOT produce a top-level
 * barrel. This file re-exports them so consumers can do:
 *
 *     import { useMe, useLogin } from '@complaints/api';
 *
 * If a new tag is added to the OpenAPI spec, add a `export *` line here
 * after regenerating. This is the only hand-maintained surface bridging
 * generated code to package consumers.
 */

export * from './generated/staff-auth/staff-auth';
export * from './generated/master-data-read/master-data-read';
export * from './generated/master-data-admin-—-subdivisions/master-data-admin-—-subdivisions';
export * from './generated/master-data-admin-—-distribution-centers/master-data-admin-—-distribution-centers';
export * from './generated/master-data-admin-—-categories/master-data-admin-—-categories';
export * from './generated/admin-staff/admin-staff';
export * from './generated/consumer-auth/consumer-auth';
export * from './generated/consumer-master-data-read/consumer-master-data-read';
// Consumer complaints: we re-export the read hook + raw `submit` helper.
// `useSubmit` from this module is intentionally NOT used directly by the
// web app — the generated multipart helper appends the `complaint` part
// as a plain string (BE then sees `Content-Type: text/plain` and 400s
// the request). The app calls a hand-rolled `submitComplaintMultipart`
// in `apps/web/src/features/consumer/submitComplaint.ts` that wraps the
// JSON body in a `Blob` with `type: 'application/json'`. We re-export
// the names below for type-only access; if BE patterns elsewhere want
// the hook, they can import it directly from the generated path.
//
// Phase 5 (BE Stages 17–19) adds:
//   useCancel          → cancel-while-SUBMITTED (alias: useCancelComplaint)
//   useSubmitFeedback  → feedback-after-CLOSED  (alias: useSubmitFeedback…
//                        kept as-is, name is already intention-revealing)
//   useGetHistory1     → consumer-safe history  (alias: useGetConsumerComplaintHistory)
//   useList            → consumer tracking list — NOT re-exported. The
//                        ListParams type has a nested `pageable` object;
//                        orval's URL builder serialises it as
//                        `[object Object]`. Same upstream bug as the
//                        staff list. The web app uses the hand-rolled
//                        `useConsumerComplaintsList` in
//                        `apps/web/src/features/consumer/trackingApi.ts`.
//
// `useGetHistory1`: the `1` suffix exists because staff has
// `useGetHistory` (un-suffixed). Re-verify after every `pnpm api:gen`.
export {
  useGetByTicket as useGetComplaintByTicket,
  getGetByTicketQueryKey as getGetComplaintByTicketQueryKey,
  getByTicket as getComplaintByTicket,
  useCancel as useCancelComplaint,
  getCancelMutationOptions as getCancelComplaintMutationOptions,
  useSubmitFeedback,
  getSubmitFeedbackMutationOptions,
  useGetHistory1 as useGetConsumerComplaintHistory,
  getGetHistory1QueryKey as getConsumerComplaintHistoryQueryKey,
} from './generated/consumer-complaints/consumer-complaints';

/*
 * Intention-revealing aliases.
 *
 * The BE OpenAPI spec assigns generic operationIds like `create`, `update`,
 * `activate` to every CRUD controller method. When orval emits multiple
 * tag-split files those names collide, so it disambiguates with numeric
 * suffixes (`useCreate1`, `useCreate2`, …) whose order depends on tag
 * iteration. That's both unreadable at call-sites and brittle to BE
 * controller re-ordering. We re-export them once here under names that
 * actually say what they do.
 *
 * Numeric mapping today (re-verify after every `pnpm api:gen`):
 *   1 → subdivisions   2 → distribution centres   3 → categories
 */
export {
  useCreate1 as useCreateSubdivision,
  useUpdate1 as useUpdateSubdivision,
  useActivate1 as useActivateSubdivision,
  useDeactivate1 as useDeactivateSubdivision,
} from './generated/master-data-admin-—-subdivisions/master-data-admin-—-subdivisions';

export {
  useCreate2 as useCreateDistributionCenter,
  useUpdate2 as useUpdateDistributionCenter,
  useActivate2 as useActivateDistributionCenter,
  useDeactivate2 as useDeactivateDistributionCenter,
} from './generated/master-data-admin-—-distribution-centers/master-data-admin-—-distribution-centers';

export {
  useCreate3 as useCreateCategory,
  useUpdate3 as useUpdateCategory,
  useActivate3 as useActivateCategory,
  useDeactivate3 as useDeactivateCategory,
} from './generated/master-data-admin-—-categories/master-data-admin-—-categories';

// admin-staff hooks already have unique names but are too generic — rename
// at the boundary so screens never accidentally import `useList` from the
// staff tag when they meant masterdata.
//
// Numeric suffix shift (BE Stage 17 — consumer `list` took the un-suffixed
// slot, bumping admin-staff list from `useList` → `useList1`).
// Re-verify after every `pnpm api:gen`.
export {
  useList1 as useListStaff,
  useGet as useGetStaff,
  useCreate as useCreateStaff,
  useUpdate as useUpdateStaff,
  useActivate as useActivateStaff,
  useDeactivate as useDeactivateStaff,
  useResetPassword as useResetStaffPassword,
  getList1QueryKey as getListStaffQueryKey,
} from './generated/admin-staff/admin-staff';

// Staff Complaint Management — assign, reassign, severity, reject,
// mark-duplicate, get-by-id, history.
// Mutation hooks have unique names and are exported as-is.
// The two query hooks use generic operationIds (`getById`, `getHistory`) that
// would collide if a second resource adds identical operationIds in future —
// alias them at the boundary so call-sites are always unambiguous.
//
// Numeric mapping (re-verify after every `pnpm api:gen`):
//   getById  → 1 (un-suffixed went to staff-directory tag, Stage 14.5)
//   list     → 2 (un-suffixed is admin-staff `list`, technician is `list1`)
//   getHistory has no collision yet
//
// NOTE: `useList2` (paged complaint search, Stage 16) is intentionally
// NOT re-exported — the generated URL builder serialises nested
// `pageable`/`filters` objects as `[object Object]` and breaks server-side
// paging. The web app uses the hand-rolled wrapper in
// `apps/web/src/features/complaints/listApi.ts` instead. Same for
// `useList1` in `technician-complaints`.
export {
  useUpdateSeverity,
  getUpdateSeverityMutationOptions,
  useReject,
  getRejectMutationOptions,
  useReassign,
  getReassignMutationOptions,
  useMarkDuplicate,
  getMarkDuplicateMutationOptions,
  useAssign,
  getAssignMutationOptions,
  useClose,
  getCloseMutationOptions,
  useGetById1 as useGetStaffComplaintById,
  getGetById1QueryKey as getStaffComplaintByIdQueryKey,
  useGetHistory as useGetStaffComplaintHistory,
  getGetHistoryQueryKey as getStaffComplaintHistoryQueryKey,
} from './generated/staff-complaint-management/staff-complaint-management';

// Staff Directory (Stage 14.5, extended Stage 16) — read-only,
// any-authenticated-staff lookup for resolving user IDs into
// { fullName, employeeId, role, distributionCenterId, enabled, … }.
// Distinct from the ADMIN-only `/admin/staff` lifecycle surface
// (re-exported above as `useListStaff` etc.).
//
// We only re-export the single-id `useGetById` (the URL builder is
// safe — single int path param). The list/search operation
// (`useSearch` post-Stage 16) is consumed via the hand-rolled
// wrapper in `apps/web/src/features/staffDirectory/api.ts` because
// orval serialises the nested `pageable` query object as
// `[object Object]`, the same bug that affects the complaint list
// hooks.
//
// The single-id hook's operationId still collides with
// staff-complaint-management (post-Stage 16:
//   staff-directory          getById → un-suffixed
//   staff-complaint-management getById → useGetById1
// Re-verify the suffix after every `pnpm api:gen`.
export {
  useGetById as useGetStaffDirectoryById,
  getGetByIdQueryKey as getStaffDirectoryByIdQueryKey,
} from './generated/staff-directory/staff-directory';


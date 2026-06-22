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
export {
  useGetByTicket as useGetComplaintByTicket,
  getGetByTicketQueryKey as getGetComplaintByTicketQueryKey,
  getByTicket as getComplaintByTicket,
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
export {
  useList as useListStaff,
  useGet as useGetStaff,
  useCreate as useCreateStaff,
  useUpdate as useUpdateStaff,
  useActivate as useActivateStaff,
  useDeactivate as useDeactivateStaff,
  useResetPassword as useResetStaffPassword,
  getListQueryKey as getListStaffQueryKey,
} from './generated/admin-staff/admin-staff';

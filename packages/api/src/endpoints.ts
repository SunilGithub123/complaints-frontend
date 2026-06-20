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


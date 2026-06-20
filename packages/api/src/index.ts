/**
 * Public surface of `@complaints/api`.
 *
 * Generated code (TanStack Query hooks + TS interfaces + Zod validators)
 * lives under `./generated/**` and is produced by `pnpm api:gen` (orval).
 * The transport (`./client.ts`) is hand-written but framework-free.
 */

// Generated TanStack Query hooks + endpoint helpers (via manual tags-split barrel).
export * from './endpoints';

// Generated TS interfaces for every component schema.
export * as Schemas from './generated/schemas';

// Transport + error contract.
export {
  customFetch,
  setAuthHooks,
  ApiError,
  type ApiErrorBody,
  type AuthHooks,
  type CustomFetchInit,
} from './client';


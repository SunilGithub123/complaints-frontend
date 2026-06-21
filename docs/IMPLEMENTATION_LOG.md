# Implementation Log — frontend (`complaints-frontend`)

> Living record of what has actually shipped on the **frontend** side, per phase / per
> stage. Update at the end of every stage. **Phases and stages here track the same
> ROADMAP as the backend** (`../complaints/docs/ROADMAP.md`).
>
> **Backend has its own log** at `../complaints/docs/IMPLEMENTATION_LOG.md`. Stages
> that span both repos (e.g. Stage 3 OpenAPI contract export → orval codegen)
> appear in both logs; each log is the source of truth for its own slice and
> cross-links to the other.
>
> Format per entry:
> 1. **Scope delivered** — packages / files / screens.
> 2. **Incidents fixed during implementation** — root cause + fix, so we don't
>    relearn the lesson next phase.
> 3. **Tests added** (count + intent; per the minimum-test policy).
> 4. **Build status** at end of stage (typecheck, tests, bundle size vs 180 KB
>    gzipped budget).
> 5. **Carry-overs / known follow-ups** — anything explicitly deferred.

---

## Phase 0 — Scaffolds (done before this log existed)

- pnpm + Turborepo workspaces, `apps/web` (React 19 + Vite 6 + TS strict).
- `packages/{api,i18n,ui-tokens,utils}` stubs.
- `@complaints/utils` exporting `IST_TIMEZONE` + `formatIstDateTime` (no moment, no dayjs).
- Vite dev-proxy to `/api` → `http://localhost:8080`.
- `.github/copilot-instructions.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `AGENTS.md`, `CONTRIBUTING.md` aligned with backend conventions.
- **Build status**: `pnpm --filter web build` → 195 KB JS / 61 KB gzipped (budget 180 KB).

---

## Phase 1 — Staff Login + Master Data

> Stages 1 and 2 are **backend-only** (auth module, masterdata module). See
> `../complaints/docs/IMPLEMENTATION_LOG.md` for those entries. Stages 3 and 4
> involve frontend work.

### Stage 3 · `packages/api` orval codegen — ✅ 2026-06-20

> Pairs with the backend's "Stage 3 · OpenAPI contract export (backend half)"
> entry. Backend ships the reproducible `docs/openapi.json` snapshot; we consume
> it here via orval.

#### Scope delivered

- **`packages/api/openapi.json`** — byte-identical copy of `../complaints/docs/openapi.json` (23 paths, OpenAPI 3.0.1, `bearerAuth` + `consumerVerifyToken`). Keeps this repo self-contained / reviewable; no live backend needed at build time.
- **`packages/api/package.json`** — added `orval`, `@tanstack/react-query`, `zod`, `vitest`. Scripts: `api:gen`, `typecheck`, `test`.
- **`packages/api/orval.config.ts`** — two-target config (endpoints + Zod), `mode: 'tags-split'`, `client: 'react-query'`, `httpClient: 'fetch'`, custom mutator → `./src/client.ts#customFetch`, `clean: true`, `prettier: true`.
- **`packages/api/src/client.ts`** — framework-free `customFetch(url, RequestInit)` mutator + typed `ApiError` + `setAuthHooks({ getAccessToken, getRefreshToken, onUnauthenticated, onTokensRefreshed, baseUrl })`. Refresh-once on 401, single in-flight refresh promise, dispatches `window` `'auth:logout'` event on refresh failure. No React, no `import.meta.env` reads (package stays node-runnable for Vitest).
- **`packages/api/src/endpoints.ts`** — small hand-written barrel re-exporting the 5 tags-split files (orval doesn't emit a top-level barrel in `tags-split` mode; see incident #1).
- **`packages/api/src/index.ts`** — public surface: `export *` endpoints, `export * as Schemas`, plus `customFetch` / `setAuthHooks` / `ApiError`.
- **`packages/api/src/generated/**`** — 42 generated `.ts` files committed (228 KB) so PRs are diff-able.
- **`turbo.json`** — new `api:gen` task with cache `inputs: ['packages/api/openapi.json', 'packages/api/orval.config.ts']` / `outputs: ['packages/api/src/generated/**']`; `build` now `dependsOn: ['^build', '^api:gen']`.
- **`apps/web/src/App.tsx`** — smoke import of `useMe` + `Schemas.StaffSummaryResponse` proves the type chain end-to-end.

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `tags-split` + `target: 'endpoints.ts'` produced no top-level barrel — only per-tag folders (`staff-auth/staff-auth.ts`, etc.). | In `tags-split` mode orval ignores the target basename and emits one folder per OpenAPI tag, with **no aggregate index**. | Hand-wrote a 5-line `src/endpoints.ts` barrel re-exporting each tag file. Documented: adding a new backend tag means adding a line here. |
| 2 | `signal: true` + `httpClient: 'fetch'` in orval 7.21 emitted call-sites like `me(signal)` where the generated `me`'s parameter was typed `RequestInit` — 30+ `TS2559` errors. | Known orval bug in the fetch+signal combination. | Dropped to `signal: false` for now. **Carry-over** — revisit once orval fixes the fetch-mode signal plumbing; query cancellation on unmount isn't free until then. |
| 3 | First-pass `customFetch(config)` signature mismatched orval's actual `(url, RequestInit)` calling convention → 30+ `TS2554` errors across all generated hooks. | Misread the mutator contract; orval's fetch client passes `(url: string, init?: RequestInit)`, not a single config object. | Refactored to `(url: string, init?: CustomFetchInit) => Promise<{ status, data, headers }>` (the shape orval's generated `<Op>Response*` discriminated unions consume). |

#### Tests added

- `packages/api/src/__tests__/client.test.ts` — exactly **2 Vitest cases** per the minimum-test policy:
  1. Happy path: `customFetch` attaches `Authorization: Bearer …` from `getAccessToken()` and returns parsed JSON.
  2. 401 → refresh → retry: stubs `fetch` to return 401 once then 200; asserts `/staff/auth/refresh` was called exactly once and the original request was retried with the new access token.

**No tests on generated code** — testing generated code tests the generator, not us.

#### Build status

```
pnpm --filter @complaints/api api:gen    → clean
pnpm --filter @complaints/api typecheck  → 0 errors
pnpm --filter @complaints/api test       → 2/2 pass
pnpm --filter web build                  → green, 61.18 KB gzipped JS
                                            (budget 180 KB → 119 KB headroom)
```

#### Carry-overs / known follow-ups

- **Re-enable `signal: true`** in `orval.config.ts` once the fetch-httpClient signal bug is fixed upstream → query-cancel-on-unmount comes back for free.
- **Tag-folder names** contain em-dashes (from OpenAPI tag strings like `Master Data (admin) — Subdivisions`). Works but ugly; consider an `orval output.override.tag` rename map in a future pass.
- **No `vitest.config.ts` yet** — implicit config is fine for the node-runnable `client.test.ts`; add the file when JSDOM env is needed for the first React Testing Library test (Stage 4).
- **Snapshot sync is manual.** Today: `cp ../complaints/docs/openapi.json packages/api/openapi.json` before `pnpm api:gen`. Backend tracks the CI automation as a Phase 7 follow-up.

---

### Stage 4 · `apps/web` staff login + master-data screens — ✅ 2026-06-21

> Pairs with the backend's Stage 1 + Stage 2 entries — every endpoint
> this stage consumes (`/staff/auth/*`, `/staff/me`, `/staff/masterdata/*`)
> is already feature-complete on the backend. FE work was purely the UI
> + auth-state + routing layer on top of the orval bindings shipped in
> Stage 3.

#### Scope delivered

##### UI foundation

- **Tailwind v4** via `@tailwindcss/vite` plugin (single `@import 'tailwindcss'`
  in `src/index.css`). PostCSS config not needed.
- **Design-token seed** in `index.css` via `@theme { --color-brand-*
  --color-danger-* --color-muted-* --radius-card }`. Lives at the app
  for now; moves into `@complaints/ui-tokens` on the second reuse
  (Phase 4 mobile).
- **Hand-authored shadcn-style primitives** under
  `src/components/ui/{button,input,label,card,alert,skeleton,table,badge}.tsx`.
  Deliberately did **not** run `npx shadcn add` — only the primitives
  actually consumed this stage. `dropdown-menu` was on the spec but not
  needed (topbar logout is a plain Button), skipping it saves a radix
  dep.
- **`cn()` helper** at `src/lib/utils.ts` (`clsx` + `tailwind-merge`).

##### Auth state

- **`src/auth/authStore.ts`** — Zustand store `{ accessToken, refreshToken,
  staff }`. `persist` middleware → localStorage key `complaints:auth`.
  Selectors only — no thunks. Setters: `setSession`, `setTokens`,
  `setStaff`, `clear`.
- **`src/auth/wireApi.ts`** — single boot-time `setAuthHooks(...)` call
  wiring `getAccessToken` / `getRefreshToken` / `onTokensRefreshed` /
  `onUnauthenticated` to the store, with `baseUrl` from
  `import.meta.env.VITE_API_BASE_URL ?? '/api/v1'`. `packages/api`
  stays framework-free.
- **`src/auth/guards.tsx`** — three route guards:
  - `RequireAuth` → redirects to `/login` if no access token.
  - `RequirePasswordChanged` → redirects to `/change-password` when
    `staff.passwordResetRequired === true` and the path is not in
    `PASSWORD_RESET_ALLOWLIST = ['/change-password', '/logout']`.
    Mirrors backend Stage 1 constraint.
  - `RequireRole({ roles })` → exported but unused this stage; Phase 2
    admin write screens will use it.
- **`auth:logout` listener** in `App.tsx` — when the transport
  dispatches the event, clears the store and hard-navs to `/login`
  (flushes any lingering TanStack Query cache that holds the dead token).

##### Routing

- **`src/router.tsx`** — `createBrowserRouter` with three guard layers
  (`RequireAuth` → `RequirePasswordChanged` → `DashboardLayout`). Every
  screen is `React.lazy()` + `<Suspense fallback={Skeleton}>` per the
  copilot-instructions hint on route-level code splitting.
- **Routes**: `/login`, `/change-password`, `/`,
  `/masterdata/{subdivisions, distribution-centers, categories}`,
  catch-all `*`.

##### Screens

- **`LoginScreen`** — React Hook Form + Zod (`{ employeeId, password }`).
  Calls `useLogin`, writes the session triple into the store, routes
  to `/change-password` or `/` based on `staff.passwordResetRequired`.
  `BAD_CREDENTIALS` ApiError → generic `errors.badCredentials` i18n
  string (BRD §4.1 — never disclose whether the employeeId exists).
  Every label / placeholder / error via `useT()`.
- **`ChangePasswordScreen`** — RHF + Zod with the backend's complexity
  regex baked in (`min 12`, lower + upper + digit + symbol),
  `confirmPassword` via `refine()` match. Calls `useChangePassword`,
  flips `staff.passwordResetRequired` to `false`, routes to `/`.
- **`DashboardLayout`** — topbar (welcome + role + logout) + role-aware
  side nav (`ADMIN` sees master-data links; `ENGINEER` / `TECHNICIAN`
  get just Home until Phase 3). Logout calls `useLogout`, clears the
  store regardless, routes to `/login`.
- **`HomeScreen`** — placeholder dashboard copy.
- **`screens/masterdata/MasterdataTable.tsx`** — extracted generic
  shell **after** the third masterdata screen earned it (three
  callsites — per the "add the abstraction the second time you need
  it" rule). Handles Skeleton / Alert / empty / generic columns via
  `MasterdataColumn<TRow>[]`. Co-located `ActiveBadge`.
- **`SubdivisionsScreen` / `DistributionCentersScreen` /
  `CategoriesScreen`** — ~30 lines each: call `useList*` with a default
  `Pageable`, pass rows + columns to `MasterdataTable`. Read-only —
  admin CRUD is Phase 2.
- **`NotFoundScreen`** — 404 with "back to dashboard" button.

##### i18n

- **`packages/i18n/src/index.ts`** — i18next singleton with EN + MR
  resources, locale persisted to `complaints:locale`. Named exports
  `initI18n`, `setLocale`, `useT`, `SUPPORTED_LOCALES`. Thin re-export
  of `useTranslation().t` so consumers can't drift onto react-i18next
  directly.
- **`packages/i18n/src/locales/en.json` + `mr.json`** — full key tree
  for every string this stage: `common.*`, `staff.login.*`,
  `staff.changePassword.*`, `staff.dashboard.*`, `masterdata.{common,
  subdivisions, distributionCenters, categories}.*`, `errors.*`,
  `notFound.*`. Marathi mirrors the English key tree exactly.

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `pnpm --filter web typecheck` failed with `TS6310: Referenced project '…/tsconfig.node.json' may not disable emit.` | `tsc -b --noEmit` conflict — the composite child project must emit declarations for `--build`, but the top-level `--noEmit` blocks all emit. | Switched typecheck to `tsc --noEmit -p tsconfig.json` (app project only). The composite build remains via `tsc -b && vite build` in the `build` script. |
| 2 | `Cannot find module '@tanstack/react-query'` in `apps/web/src/App.tsx`. | It was a transitive of `@complaints/api` but not a direct dep of `web`; pnpm hoisting is brittle. | Added `@tanstack/react-query` as a direct dep of `apps/web`. |
| 3 | Vitest pass / typecheck fail: `Cannot find name 'beforeEach'`. | First test file imported `describe`/`it`/`expect`/`vi` but not `beforeEach`; Vitest's `globals: true` resolves at runtime but TS still needs explicit imports without `@types/vitest` globals declarations. | Imported `beforeEach` explicitly from `vitest`. |

#### Tests added

Exactly **4 RTL / Vitest cases** per the minimum-test policy:

- `src/screens/login/LoginScreen.test.tsx`
  1. Happy: fills form → mocked `useLogin` resolves → asserts
     `navigate('/', { replace: true })` was called and the store now
     holds the access token.
  2. Unhappy: mocked `useLogin` rejects with
     `ApiError({ code: 'BAD_CREDENTIALS', status: 401 })` → asserts the
     localized error string is visible **and** no navigation occurred
     **and** the store is untouched.
- `src/auth/RequirePasswordChanged.test.tsx`
  1. `passwordResetRequired: true` + non-allowlisted route → renders
     the `/change-password` element.
  2. `passwordResetRequired: false` → renders the protected route.

**No tests on masterdata list screens** — they are thin renders over
generated hooks; testing them tests React Query, not us. Revisit when
filters / sort / pagination land in Phase 2.

Vitest setup:

- `apps/web/vitest.config.ts` — `environment: 'jsdom'`, `globals: true`,
  `setupFiles: ['./src/test/setup.ts']`, `css: false`.
- `apps/web/src/test/setup.ts` — imports
  `@testing-library/jest-dom/vitest`, boots the real i18n singleton in
  `en`, registers RTL `cleanup()` in `afterEach`.

#### Build status

```
pnpm --filter web typecheck          → 0 errors
pnpm --filter web test               → 4/4 pass  (2 files, 1.07 s)
pnpm --filter @complaints/api test   → 2/2 pass  (still green)
pnpm --filter web build              → green
```

Bundle (gzipped, first-load entry chunk):

| Stage | Entry JS gz | Δ | Budget | Headroom |
|-------|-------------|---|--------|----------|
| 3     | 61.18 KB    | — | 180 KB | 119 KB |
| 4     | **129.91 KB** | **+68.73 KB** | 180 KB | **50 KB** |

CSS gzipped: **3.69 KB** (budget 20 KB).

Per-route lazy chunks (gzipped):

```
LoginScreen                  1.11 KB
ChangePasswordScreen         1.14 KB
DashboardLayout              0.96 KB
SubdivisionsScreen           0.47 KB
DistributionCentersScreen    0.49 KB
CategoriesScreen             0.47 KB
MasterdataTable (shared)     5.03 KB
staff-auth (generated hooks) 1.55 KB
```

Headroom is tight. Phase 2 admin write screens **must** lazy-load any
heavy form widgets rather than land in the entry chunk.

#### Carry-overs / known follow-ups

- **`eslint-plugin-i18next` no-literal-string rule** — the task asked
  for it scoped to `apps/web/src/screens/**`. The repo has no ESLint
  flat config yet; adding one is a separate slice. **All visible
  strings in Stage 4 screens already go through `useT()`** — verified
  by code review. Tracked alongside the rest of CI gates (Phase 1.5).
- **Marathi parity CI guard** — both catalogues mirror today; a future
  step should diff key trees on every PR (Phase 7).
- **shadcn `<Form>` / `<FormField>` primitives** — skipped. Two forms
  (login + change-password) don't justify the ceremony; revisit on the
  third form (likely admin masterdata create in Phase 2).
- **`dropdown-menu` primitive** — listed in the task but not needed
  (logout is a plain Button). Will add when a real menu lands.
- **TanStack Query DevTools** — production-only concern; wired in
  Phase 7 alongside Sentry.
- **`useMe` not called on app boot** — store hydrates from
  localStorage; if the persisted token has been revoked server-side
  the next API call surfaces 401 → refresh → logout. Proactively
  calling `useMe` at boot would shorten the round-trip. Deferred to
  Phase 2.
- **Locale switcher UI** — `setLocale()` exists; UI lands with the
  profile / settings screen in Phase 5.
- **axe-core E2E** — Phase 2 alongside the four critical Playwright
  journeys (see `FRONTEND_DESIGN.md §9.2`).

#### Post-Stage-4 incidents (hotfixes)

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Login (and every other API call) 404'd against `/api/v1/api/v1/staff/auth/login` — doubled `/api/v1` prefix. | The committed OpenAPI snapshot embeds `/api/v1` in every `paths` entry, so orval-generated callsites already pass `/api/v1/...` as an origin-relative URL. `setAuthHooks({ baseUrl: '/api/v1' })` in `wireApi.ts` (plus `DEFAULT_BASE_URL = '/api/v1'` + `REFRESH_PATH = '/staff/auth/refresh'` in `packages/api/src/client.ts`) then prepended it again. | Flipped defaults to empty: `wireApi.ts` reads `VITE_API_BASE_URL ?? ''`; `client.ts` `DEFAULT_BASE_URL = ''` and `REFRESH_PATH = '/api/v1/staff/auth/refresh'`. Dev still works because Vite's proxy forwards `/api/*` → `http://localhost:8080`; prod works because the web app is served same-origin behind a reverse proxy. Hosts that need to point at a different origin still inject a fully-qualified `baseUrl` (e.g. mobile). Updated the two assertions in `packages/api/src/__tests__/client.test.ts` that encoded the old doubled-prefix expectation. No new tests — the existing happy + 401-refresh pair already covers the URL-assembly contract.
| 2 | After a successful first-login password change, every protected call (e.g. `GET /api/v1/staff/masterdata/subdivisions`) was rejected with `403 PASSWORD_RESET_REQUIRED — "Password change is required before continuing"`. | The BE bakes `passwordResetRequired` into the JWT access token at **login** time. `POST /staff/auth/change-password` only returns a fresh `StaffSummary` — it does **not** rotate tokens. The FE updated `staff` in the store (so the `RequirePasswordChanged` guard let the user navigate) while the still-issued access token continued to carry the stale `passwordResetRequired = true` claim, which the BE auth filter rejects. | `ChangePasswordScreen` now follows `changePassword` with an immediate `useRefresh({ refreshToken })` call, then writes the fresh `{ accessToken, refreshToken, staff }` triple via `setSession(...)` before navigating to `/`. Falls back to `setStaff(...)` only if no refresh token is present (defensive — shouldn't happen for a logged-in user). No new tests — the FE contract is unchanged from the test's perspective (form submit → store mutation → navigate); the bug was in the *order* of side-effects, not the surface.

---

## Phase 2 — Admin write + Staff management

> Backend Stages 5 + 6 (masterdata writes + admin staff CRUD) ship the
> contracts this frontend stage consumes. See
> `../complaints/docs/IMPLEMENTATION_LOG.md` for those entries.

### Stage 7 · `apps/web` admin write screens + staff user management — ✅ 2026-06-22

#### Scope delivered

- **`packages/api`**
  - Regenerated bindings from the updated `openapi.json` (admin-staff
    tag added by BE Stage 6).
  - Extended `endpoints.ts` barrel with intention-revealing aliases
    for the orval numeric-suffix collisions on `create` / `update` /
    `activate` / `deactivate` (1 = subdivisions, 2 = distribution
    centres, 3 = categories). Re-exported the admin-staff hooks under
    `useListStaff` / `useCreateStaff` / etc. and `getListStaffQueryKey`
    so screens never collide with the generic `useList`. **The
    numeric mapping is comment-documented and must be re-verified
    after every `pnpm api:gen`.**
- **`apps/web` primitives** (zero new npm deps)
  - `components/ui/dialog.tsx` — hand-rolled over the native
    `<dialog>` element. Saves ~10 KB gzipped vs `@radix-ui/react-dialog`.
    Test-safe: falls back to the `open` attribute when jsdom doesn't
    implement `showModal()`/`close()`.
  - `components/ui/select.tsx` — styled native `<select>`. Free a11y,
    zero bundle cost.
  - `components/ui/toast.tsx` — Zustand-backed store + `ToastViewport`
    mounted once in `App.tsx`. Auto-dismiss 5 s, dismissable. Saves
    ~6 KB gzipped vs `@radix-ui/react-toast`. Imperative `toast.*`
    shortcuts plus the `useToast()` hook for screens.
  - `lib/apiErrors.ts` — `mapApiError(err, t)` → `{ code, message, fieldErrors }`.
    Centralised so screens never grow `if (code === 'X') ...` ladders.
    Looks up `errors.<BE_CODE>` keys; falls back to BE message →
    `errors.generic`.
- **Masterdata admin screens** (gated by `RequireRole={['ADMIN']}`)
  - `SubdivisionsAdminScreen.tsx` + `SubdivisionFormDialog.tsx`.
  - `DistributionCentersAdminScreen.tsx` + `DistributionCenterFormDialog.tsx`.
    Form derives `subdivisionId` from the signed-in admin's token (no
    picker per spec — Phase 1 admins are subdivision-scoped).
  - `CategoriesAdminScreen.tsx` + `CategoryFormDialog.tsx`. SLA hours
    coerced + range-checked 1–720.
  - `MasterdataTable` extended with optional `toolbar?: React.ReactNode`
    so the "New X" button slots into the header row without a new
    wrapper component.
  - Each form: React Hook Form + Zod, BE `fieldErrors` mapped onto
    individual inputs via `setError`. The three guardrail codes
    `SUBDIVISION_HAS_ACTIVE_DCS` / `SUBDIVISION_HAS_ACTIVE_STAFF` /
    `DC_HAS_ACTIVE_STAFF` surface as non-blocking warning toasts; row
    state stays unchanged (BE rejected the deactivate).
- **Staff management** (`/admin/staff`, ADMIN-only)
  - `StaffListScreen.tsx` — server-side paginated TanStack Query list,
    filters by role / DC id / enabled. Per-row Edit / Activate /
    Deactivate / Reset. Self-protection: Deactivate + Reset are hidden
    for the row whose `id` equals the signed-in admin's id (BE also
    enforces `CANNOT_DEACTIVATE_SELF`; failing fast in the UI saves a
    round-trip).
  - `StaffFormDialog.tsx` — bifurcated by mode because the BE bifurcates
    the payload (`CreateStaffRequest` vs `UpdateStaffRequest` — role
    and employeeId are immutable post-create). `subdivisionId` for
    create comes from the auth store. DC picker appears only when role
    is ENGINEER or TECHNICIAN. `EMPLOYEE_ID_TAKEN` is mapped onto the
    employeeId field as well as the form-level alert. DC option list
    loads via the existing `useListDcs` read hook (single page of 100
    — enough for Phase 2 cardinality).
  - `TempPasswordDialog.tsx` — one-time reveal after create or reset.
    Password lives **only** in the screen's transient component state;
    closing the dialog drops it. Never written to localStorage, never
    logged. Copy-to-clipboard with inline "Copied" status; falls back
    to manual copy if the Clipboard API is unavailable.
- **Routing** — `router.tsx` consolidated all admin write paths under
  a single `<RequireRole roles={['ADMIN']} />` outlet (one guard layer
  instead of per-route checks). `/admin/staff` added alongside the
  three masterdata paths.
- **Nav** — `DashboardLayout` adds the "Staff" link to `ADMIN_NAV`.
- **i18n** — Full EN + MR coverage for:
  - `common.{create,creating,edit,saving,activate,deactivate,actions,yes,no,close,copy,copied,all,previous,next,page}`.
  - `masterdata.common.{createdToast,updatedToast,activatedToast,deactivatedToast,codePattern,required}`
    plus `*.createTitle/editTitle/newButton` for each entity.
  - Full `adminStaff.{heading,subheading,newButton,filter*,role.*,table.*,form.*,tempPassword.*,resetConfirm.*,deactivateConfirm.*}` tree.
  - 13 new error codes under `errors.*` covering the 3 masterdata
    guardrails + 8 staff-management BE codes + `VALIDATION_FAILED` +
    `DUPLICATE_KEY`.

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `Dialog` tests failed under jsdom with `TypeError: el.showModal is not a function`. | jsdom doesn't implement the imperative `HTMLDialogElement` methods. | Guarded `showModal()` / `close()` with `typeof === 'function'` checks; fall back to setting/removing the native `open` attribute so the dialog content still renders in tests. Real browsers continue to use the imperative API (focus trap, `inert`, backdrop layer). |
| 2 | `pnpm --filter web typecheck` failed with `'@complaints/api' has no exported member named 'getListStaffQueryKey'`. | Re-exported only the staff *hooks* in the manual barrel; forgot the matching query-key helper that screens need for `invalidateQueries`. | Added `getListQueryKey as getListStaffQueryKey` to the admin-staff named re-export block in `packages/api/src/endpoints.ts`. |
| 3 | `findByText(EMPLOYEE_ID_TAKEN message)` matched twice (field error + form-level alert) and threw. | Two render sites surface the same i18n string by design — the user sees a focused field error *and* the summary alert. | Test asserts `findAllByText(...).length > 0` instead of `findByText`. |

#### Tests added

Five files / **8 tests** total (4 new this stage, 4 pre-existing). All
green:

- `screens/admin-staff/StaffFormDialog.test.tsx` — 2 tests (happy
  create + reveal temp password; `EMPLOYEE_ID_TAKEN` rejected →
  field-level error + no reveal). `useListDcs` is mocked for a
  deterministic option list; mutation hooks are injected props so the
  test owns them.
- `screens/admin-staff/TempPasswordDialog.test.tsx` — 1 test
  enforcing the **two non-negotiable rules**: dialog is dismissable
  AND the temporary password is not present in *any* `localStorage`
  key (scans every key, not just `complaints:auth`).
- `screens/masterdata/SubdivisionsAdminScreen.test.tsx` — 1 test for
  the `SUBDIVISION_HAS_ACTIVE_DCS` guardrail: clicking Deactivate
  fires the mutation, the BE rejects, the warning toast renders with
  the localised text.

Per the minimum-test policy (`.github/copilot-instructions.md`):
intentionally **no** tests for the DC / Category form dialogs — they
share the same pattern as the Subdivision one. Bumping coverage on a
copy-paste form pattern doesn't earn its keep.

#### Build status

- `pnpm -w typecheck` → ✅
- `pnpm -w test` → ✅ **5 files / 8 tests passing** (`@complaints/api` 2,
  `apps/web` 6).
- `pnpm -w build` → ✅
- **Initial JS gzipped: 133.09 KB** (budget 180 KB → **46.91 KB headroom**).
  Δ from Stage 4 baseline (129.91 KB): **+3.18 KB**, all of it in the
  new Zustand toast store + `mapApiError` helper that the entry chunk
  imports.
- CSS gzipped: **4.20 KB** (budget 20 KB).
- Admin write screens are **all route-level lazy** so they stay out of
  the entry chunk:

```
SubdivisionsAdminScreen           2.13 KB
CategoriesAdminScreen             2.24 KB
DistributionCentersAdminScreen    2.26 KB
StaffListScreen                   4.68 KB
dialog (shared chunk)             5.16 KB
```

#### Carry-overs / known follow-ups

- **`apps/web` ESLint script** still points at an uninstalled
  `eslint` binary (script: `"lint": "eslint . --max-warnings=0"`).
  Pre-existing Phase 0 gap, not introduced by Stage 7. ESLint flat
  config + `eslint-plugin-i18next` (no-literal-string) land in the
  Phase 1.5 CI hardening pass alongside `size-limit` and
  `lighthouse-ci`.
- **Numeric-suffix aliases in `endpoints.ts`** are positionally
  brittle — if the BE re-orders masterdata controllers in the OpenAPI
  tag iteration order, `useCreate1` will silently point at a
  different tag. Mitigation today is the comment-documented mapping
  + manual re-verification on every `pnpm api:gen`. Long-term fix:
  ask BE to assign unique `operationId`s (`createSubdivision` etc.).
  Filed against backend backlog.
- **DC picker for staff create** loads at most one 100-row page of
  active DCs. Single-subdivision Phase 2 caps make this fine; Phase
  4+ multi-subdivision tooling will need a paged combobox.
- **Reset-password confirmation** is a `window.confirm()` — good
  enough for Phase 2 (browser-native, no a11y regression). A Dialog-
  based confirm primitive can replace it when the third destructive
  confirm appears (currently: deactivate masterdata, deactivate
  staff, reset password — the third lands here, so the abstraction is
  due, but the existing flow is shippable).
- **`StaffFormDialog` accepts mutation hooks as injected props**
  (rather than calling `useCreateStaff()` / `useUpdateStaff()`
  internally) — done to keep the screen as the single owner of
  cache-invalidation, but it duplicates the "create vs edit" split
  that `SubdivisionFormDialog` solves internally. Inconsistency worth
  resolving the **second** time another form needs the same
  injection pattern (likely complaint forms in Phase 3).
- **No E2E for the admin write flows yet** — deferred to Phase 2
  Playwright slice alongside axe-core (`FRONTEND_DESIGN.md 9.2`).
- **Marathi parity CI guard** still outstanding (Phase 7).

---

## How to update this log

1. At the end of a stage, append (or fill in) the corresponding subsection.
2. Keep entries terse. **What shipped**, **what bit us**, **what we tested**, **what we deferred**.
3. Don't rewrite history — additive only. If we have to undo something, add a new entry that says so.
4. For stages that span both repos, **also** update `../complaints/docs/IMPLEMENTATION_LOG.md`'s matching entry (just the cross-link blurb — full detail lives in the appropriate repo's log).


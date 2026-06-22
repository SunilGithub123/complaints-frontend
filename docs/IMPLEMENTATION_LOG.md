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

### Stage 8a · Boot-time `useMe` revalidation + auth-store hydration — ✅ 2026-06-22

#### Scope delivered

- **`apps/web/src/auth/authStore.ts`**
  - New `lastValidatedAt: number | null` slot. Persisted store
    `partialize` deliberately **excludes** it — it is a per-session,
    in-memory flag so the boot guard fires on every cold load.
  - `setSession(...)` and `setTokens(...)` reset `lastValidatedAt`
    to `null` so the next `RequireAuth` mount revalidates after
    login / change-password / silent refresh.
  - New `setValidatedStaff(staff)` mutator — writes the server-truth
    staff and stamps `lastValidatedAt = Date.now()` in one set.
  - New `selectLastValidatedAt` selector.
- **`apps/web/src/auth/guards.tsx` → `RequireAuth`**
  - Fires the generated `useMe()` hook with `enabled: isAuthed && lastValidatedAt === null`,
    so the call:
      · never fires for anonymous visitors (no spurious 401 → refresh
        churn on the login screen);
      · fires exactly once per cold load with a token;
      · is skipped on every subsequent route change inside the same
        session.
  - While the call is pending on first hit, renders the same skeleton
    used by the route-level `Suspense` fallback. No stale dashboard
    flash against fresh server state.
  - On success, diffs against the cached snapshot and only writes if
    something changed (avoids a no-op re-render). Either way it
    bumps `lastValidatedAt` so the guard never re-enters the loading
    branch in the same session.
  - On error, falls through to render with the cached snapshot — the
    transport already owns the 401 → refresh-fail → `auth:logout`
    path, and the existing listener in `App.tsx` clears state and
    navigates. The guard does **not** add a second logout path.
  - Role-aware redirect handled implicitly: if the server-truth role
    differs (admin demoted to engineer), the new value lands in the
    store before children render, so downstream `<RequireRole>` and
    role-aware nav (`DashboardLayout` `ADMIN_NAV` vs `NON_ADMIN_NAV`)
    pick it up automatically on the very same render tree.

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | None encountered. | — | Stage was a small, additive change touching two files + one test file. |

#### Tests added

- `apps/web/src/auth/RequireAuth.test.tsx` — **2 tests** per the
  minimum-test policy:
  - **Happy**: cached snapshot has `role: 'ADMIN'`; `useMe` returns
    `'ENGINEER'`. Guard renders the child, the store now holds
    `'ENGINEER'`, and `lastValidatedAt` is non-null.
  - **Unhappy**: `useMe` is in `isError`. Guard falls through and
    renders the child against the cached `'ADMIN'` snapshot;
    `lastValidatedAt` stays `null` so the next mount retries. The
    401-refresh-fail-logout path itself is already covered by the
    transport tests in `@complaints/api` (no duplication).

`useMe` is mocked at module scope — we are testing the guard's
contract, not TanStack Query.

#### Build status

- `pnpm -w typecheck` → ✅
- `pnpm -w test` → ✅ **6 files / 10 tests passing** (4 from previous
  stages + 2 new for this stage; `@complaints/api` 2 unchanged).
- `pnpm -w build` → ✅
- **Initial JS gzipped: 137.20 KB** (budget 180 KB → **42.80 KB headroom**).
  Δ from Stage 7 baseline (133.09 KB): **+4.11 KB**. The bump comes
  from pulling `useMe` (and therefore the staff-auth generated module +
  small TanStack Query overhead) into the entry chunk via
  `RequireAuth`. Acceptable cost — the alternative (lazy-loading the
  guard) defeats the purpose.
- CSS gzipped: **4.20 KB** (unchanged).

#### Manual smoke

- `psql … UPDATE staff_account SET full_name='Smoke Test' WHERE employee_id='ADMIN001';`
  → reload FE (no logout) → header shows "Welcome, Smoke Test"
  immediately after the skeleton flash. No second sign-in needed.
- Role change `ADMIN → ENGINEER` server-side → reload → admin nav
  links disappear, masterdata routes 302-bounce to `/` via
  `RequireRole`.

#### Carry-overs / known follow-ups

- **`apps/web` ESLint script** still uninstalled — Phase 1.5 carry-over.
- **Stage 8b (profile editor)** is **blocked on the backend**. As of
  this writing the OpenAPI snapshot exposes only `GET /api/v1/staff/me`;
  there is no `PUT /api/v1/staff/me` and no
  `PATCH /api/v1/staff/me/notification-preferences`. Per the stage
  prompt's prerequisite rule ("If those hooks aren't in
  `@complaints/api/generated`, STOP and ping back — do not stub a fake
  endpoint") this slice is **deferred**. Owner: BE. When the BE ships
  the write endpoints + a refreshed `openapi.json`, re-sync, run
  `pnpm api:gen`, and pick up Stage 8b.
- **Clears a Stage 4 carry-over** — "useMe not called on app boot —
  proactive call deferred to Phase 2" is **CLOSED** by 8a. Mirror this
  note in `../complaints/docs/IMPLEMENTATION_LOG.md` under whichever
  cross-link blurb references the FE Stage 4 carry-over.

### Stage 8b · `/profile` editor screen — ✅ 2026-06-22

> BE shipped `PUT /api/v1/staff/me` ahead of 8a's land — see
> [`../complaints/docs/IMPLEMENTATION_LOG.md`](../complaints/docs/IMPLEMENTATION_LOG.md)
> Stage 8 entry. Re-synced `openapi.json` + ran `pnpm api:gen`;
> `useUpdateMyProfile` + `UpdateMyProfileRequest` are now generated.

#### Scope delivered

- **`packages/api`** — Re-synced from `../complaints/docs/openapi.json`
  and regenerated via `pnpm api:gen`. New hook
  `useUpdateMyProfile()` + request schema `UpdateMyProfileRequest`
  (`{ fullName (req), email?, mobile?, notificationsPushEnabled (req) }`)
  surfaced through the existing `staff-auth` tag — no endpoint barrel
  change needed.
- **`apps/web/src/screens/profile/ProfileScreen.tsx`** — New
  route-level lazy screen mounted at `/profile` under
  `RequireAuth + RequirePasswordChanged` (no role guard — every
  authenticated staff manages their own profile).
  - Read-only **Account** card resolves `subdivision` via
    `useGetSubdivision(staff.subdivisionId)` and (for non-admins) `dc`
    via `useGetDc(staff.distributionCenterId)`. Both hooks are gated by
    `query.enabled` so anonymous / mid-hydration mounts don't fire 401s.
  - Editable form: react-hook-form + zod (`buildSchema(t)` so error
    messages are localised at construction time, same pattern as
    `ChangePasswordScreen`). `email` and `mobile` use a
    `z.union([z.literal(''), …])` shape so blank submits explicitly
    mean "leave unchanged" — the BE treats omitted fields the same way.
  - On 200 commits the freshly-returned `StaffSummaryResponse` into
    the auth store via the **same** `setValidatedStaff(...)` path Stage
    8a's boot-time `/me` revalidation uses. This keeps the cached
    snapshot as a single source of truth and bumps `lastValidatedAt`
    so the next route mount won't re-fire `useMe` for stale-detection.
  - On `VALIDATION_FAILED` (or any `fieldErrors` envelope), routes
    each entry through RHF `setError` for `fullName` / `email` /
    `mobile` / `notificationsPushEnabled`; other codes fall through to
    the form-level alert via `mapApiError`.
- **Change-password CTA** — A **link**, not an inline form, to
  `/change-password?from=profile`. The existing screen now reads the
  `from` query param and bounces back to `/profile` on success
  instead of the dashboard root. Zero new flows — re-using the
  Stage 1 form keeps the password-policy regex in exactly one place.
- **Routing** — Added the `/profile` route inside the
  `RequireAuth + RequirePasswordChanged + DashboardLayout` tree.
  Sits *outside* the `RequireRole={['ADMIN']}` sub-tree because every
  staff has a profile.
- **Nav** — Added the "Profile" link to **both** `ADMIN_NAV` and
  `NON_ADMIN_NAV` in `DashboardLayout`. The list-style nav surface
  isn't an ideal home for a user-menu (avatar would be) but ships
  Phase 2 without a new primitive — avatar lands when third use
  needs it.
- **i18n** — Full EN + MR coverage for `staff.profile.*` (title,
  subtitle, summary labels, form labels + help + `*Invalid` strings,
  toast, change-password card). No new BE error codes required —
  `VALIDATION_FAILED` was already mapped in Stage 7's
  `errors.VALIDATION_FAILED` key.

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | First draft of the "BE rejects email" test 404'd on its own assertion (`findByText(/must be a valid email/i)` not present). | The test typed `'looks-ok@local'` to bypass the FE's `z.email()` guard, but zod's email regex still rejects single-segment domains, so client validation short-circuited the submit and the BE mock never ran. | Typed `'taken@example.test'` instead — it passes `z.email()` and lets the mocked BE 400 + `fieldErrors.email` propagate to `setError`. |

#### Tests added

`apps/web/src/screens/profile/ProfileScreen.test.tsx` — **2 tests** per
the minimum-test policy:

- **Happy**: fullName edited + push toggle on + submit → mutation
  fires with exactly `{ fullName, notificationsPushEnabled }` (empty
  email / mobile correctly elided); response staff committed into
  the store via `setValidatedStaff`; `"Profile updated."` toast
  rendered.
- **Unhappy**: BE `ApiError { code: 'VALIDATION_FAILED', fieldErrors: { email: '…' } }`
  → email field error rendered; the auth-store staff snapshot is
  unchanged (`fullName` still `'Eve Engineer'`).

`useUpdateMyProfile` is mocked at the module level; `useGetSubdivision`
/ `useGetDc` are stubbed for a deterministic summary card. We do **not**
test the change-password link — the navigation contract is
`/change-password?from=profile` and the receiving screen already has
its own happy + unhappy tests; duplicating coverage on
`<Link to=…>` earns nothing.

#### Build status

- `pnpm -w typecheck` → ✅
- `pnpm -w test` → ✅ **7 files / 12 tests passing** (10 from prior
  stages + 2 new for 8b; `@complaints/api` 2 unchanged).
- `pnpm -w build` → ✅
- **Initial JS gzipped: 138.26 KB** (budget 180 KB → **41.74 KB headroom**).
  Δ from Stage 8a (137.20 KB): **+1.06 KB**, all from the entry chunk
  picking up `useUpdateMyProfile` and react-router's `Link` (which was
  already imported via `NavLink`, so the marginal cost is just the
  hook + zod email regex). Profile route's own lazy chunk:
  **`ProfileScreen` 1.82 KB gzipped**.
- CSS gzipped: **4.31 KB** (unchanged within rounding).

#### Manual smoke

- Logged in as engineer `ENG010` → opened `/profile` → header
  resolved subdivision "Pune" + DC "Pune Central" → edited fullName
  + email + mobile + push toggle → save → toast → reload → values
  persisted in the header and the form re-seeded from the fresh
  `StaffSummary`.
- From `/profile` clicked "Change password" → URL became
  `/change-password?from=profile` → completed flow → landed back on
  `/profile` (not `/`). ✅

#### Carry-overs / known follow-ups

- **Avatar / user-menu primitive** — Profile lives in the sidebar nav
  for now. When the third "user-scoped surface" lands (likely
  notifications panel in Phase 3+) extract a `<UserMenu>` with the
  avatar pattern then.
- **`apps/web` ESLint script** still uninstalled (Phase 1.5 carry-over).
- **i18n parity CI guard** — still informal; both catalogues are
  mirrored manually. CI gate ships in Phase 7.
- **Email / mobile uniqueness errors** — BE does not currently emit
  `STAFF_EMAIL_TAKEN` or `STAFF_MOBILE_TAKEN` codes (verified against
  the synced spec). If those land later, add the two i18n keys; no
  code change to `mapApiError` will be needed — the helper already
  looks up `errors.<CODE>` generically.
- **Phase 2 wraps with this stage.** Next FE work is **Phase 3**
  (consumer OTP + complaint submit PWA), which is BE-led — wait for
  the consumer-side endpoints to land in the OpenAPI snapshot before
  starting.

---

## Phase 3 — Consumer entry + complaint submission (PWA)

> Backend Stages 9 + 10a/b + Stage 10b-hotfix shipped; this stage builds the
> consumer-facing PWA on top of them. **Backend cross-ref:** see
> [`../../complaints/docs/IMPLEMENTATION_LOG.md`](../../complaints/docs/IMPLEMENTATION_LOG.md)
> Stage 10b for the BE-side submit/read contract.

### Stage 11 · Consumer OTP + complaint submit + confirmation — ✅ 2026-06-22

#### Scope delivered

- **OpenAPI re-sync** — bumped `packages/api/openapi.json` to BE
  `51a2f66` (Stage 10b + the consumer-categories hotfix; 33 paths,
  +1 vs. Stage 10b). `pnpm api:gen` emitted a new
  `consumer-master-data-read/` module exposing `useListActiveCategories`
  alongside the already-shipped `consumer-auth` (`useSendOtp`,
  `useVerifyOtp`) and `consumer-complaints`
  (`useGetByTicket`, generated `submit` — see incident #1).
- **`packages/api/src/client.ts` — URL-routed token selection.**
  Added `getConsumerToken` to `AuthHooks` and a `selectAuthToken(url)`
  switch: `/api/v1/consumer/**` → consumer JWT, `/api/v1/auth/consumer/**`
  → no token (those are the OTP send/verify themselves), everything
  else → staff access JWT. The 401-refresh path is now gated on
  `isStaffUrl(url)` so consumer 401s (token expired mid-call) bubble
  straight to the guard instead of trying to refresh against
  `/staff/auth/refresh`.
- **`packages/api/src/endpoints.ts`** — new exports:
  `useListActiveCategories` (consumer-master-data-read tag),
  `useGetComplaintByTicket` / `getComplaintByTicket` /
  `getGetComplaintByTicketQueryKey` (aliases of the generated
  `useGetByTicket`). The generated `useSubmit` is deliberately **not**
  re-exported under a friendly name — we ship our own multipart helper
  (see #1).
- **`apps/web/src/features/consumer/`** — new feature folder:
  - `consumerAuthStore.ts` — Zustand store, **sessionStorage**
    (NOT localStorage), 4 fields (`token`, `expiresAt`, `consumerId`,
    `mobile`), selectors `selectIsVerified` + `selectMinutesRemaining`
    + `selectConsumerToken`. Setter `setVerified` commits the
    `OtpVerifyResponse`; `setIdentity` saves the landing-screen pair
    before OTP completes so the modal can render them.
  - `guards.tsx` — `ConsumerRequireVerification` (Outlet wrapper);
    redirects to `/consumer` with `state.from` on a miss and clears
    the stale token so the next "Send OTP" starts clean.
  - `submitComplaint.ts` — hand-rolled multipart `POST` to
    `/api/v1/consumer/complaints` (see #1) + `useSubmitComplaint`
    `useMutation` wrapper.
  - `imageCompression.ts` — `prepareImageForUpload` (MIME +
    size check → dynamic `import('browser-image-compression')` →
    re-check size). Emits typed `ImagePickError` codes
    (`IMAGE_INVALID_TYPE`, `IMAGE_TOO_LARGE`, `IMAGE_LIMIT_EXCEEDED`,
    `IMAGE_COMPRESSION_FAILED`) so the screen can render the same
    `errors.*` i18n keys we use for BE error codes.
  - `draftStorage.ts` — typed sessionStorage IO under
    `complaintDraft:v1`; fields `categoryId | description | location`.
    Images are deliberately not persisted (File objects aren't
    JSON-serialisable and IndexedDB is overkill for "user re-picks
    after a 5-minute expiry").
- **`apps/web/src/screens/consumer/`** — 4 screens / lazy-loaded:
  - `LandingScreen` (`/consumer`) — Consumer ID + mobile form
    (RHF + zod, the same `^\+?[0-9]{7,15}$` pattern the BE enforces).
    On 200 from `sendOtp`, opens the OTP modal. Already-verified
    shortcut: if `selectIsVerified` is `true` the screen renders a
    one-click "continue to submit" panel rather than re-asking for
    OTP (back-button after submit).
  - `OtpModal` — 30-second wall-clock cooldown countdown
    (`Date.now()`-driven, NOT `setTimeout`, so a tab sleep doesn't
    strand the "Resend in 3s" label), 6-digit input with
    `autoComplete="one-time-code"`, distinct error copy per BE code
    via `mapApiError`. On `OTP_TOO_MANY_ATTEMPTS` the input + verify
    button lock; "Resend OTP" remains the only escape hatch.
  - `SubmitScreen` (`/consumer/submit`) — category dropdown
    (`useListActiveCategories`), description (1–4000 chars),
    optional location (≤500 chars), image picker (0..3, JPEG/PNG,
    ≤1 MB post-compression). Auto-saves to sessionStorage on every
    keystroke via `watch` + `saveDraft`; restores from
    `loadDraft()` on mount with a one-time "we restored your draft —
    photos need to be re-picked" banner. Submits via
    `useSubmitComplaint`, hands the response down to the next route
    via `location.state.response` so the confirmation renders with
    no follow-up GET.
  - `ConfirmationScreen` (`/consumer/submitted/:ticketNo`) — renders
    from `location.state.response` when available; on page refresh
    falls back to `useGetComplaintByTicket` (read-back gated by the
    same consumer JWT). 403 → "this ticket isn't yours" screen
    (per Stage 10b contract — foreign tickets are 403 not 404).
    Copy + share + refresh affordances; "Start over" clears the
    consumer store and returns to `/consumer`.
- **Router** — `/consumer` is fully public; `/consumer/submit` and
  `/consumer/submitted/:ticketNo` sit behind `ConsumerRequireVerification`.
  All three screens are `lazy()` so the **staff** entry chunk pays
  nothing for them.
- **i18n** — new `consumer.*` namespace (landing / otp / submit /
  confirmation) + 14 new `errors.*` codes (`OTP_COOLDOWN`,
  `OTP_RATE_LIMIT`, `OTP_INVALID`, `OTP_EXPIRED`,
  `OTP_TOO_MANY_ATTEMPTS`, `CONSUMER_NOT_FOUND`, `CONSUMER_INACTIVE`,
  `IMAGE_TOO_LARGE`, `IMAGE_INVALID_TYPE`, `IMAGE_LIMIT_EXCEEDED`,
  `IMAGE_UPLOAD_FAILED`, `IMAGE_COMPRESSION_FAILED`,
  `CATEGORY_INACTIVE`, `COMPLAINT_NOT_OWNED_BY_CONSUMER`). Full
  EN + MR parity.
- **`browser-image-compression`** added as a runtime dep of `apps/web`.
  Pulled in via dynamic `import()` so the staff bundle never sees it
  and the consumer entry doesn't pay 21 KB gzipped until the user
  actually picks a photo.

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Generated `submit()` in `consumer-complaints/consumer-complaints.ts` would 400 on the BE — the prompt's own "things that will trip you up" §1 called it out preemptively. | orval emits `formData.append('complaint', JSON.stringify(complaint))` for multipart-with-JSON-part; that appends a **string**, which the browser tags as `Content-Type: text/plain`. The BE's `@RequestPart("complaint")` is bound to `application/json` and rejects the part as malformed. | Wrote `submitComplaintMultipart` in `features/consumer/submitComplaint.ts` that builds the FormData manually with `new Blob([JSON.stringify(req)], { type: 'application/json' })` for the `complaint` part, passes `File` objects unchanged for `images` (so the browser sets `image/jpeg` / `image/png` per part), and routes the whole thing through `customFetch` (which already knows not to set a top-level Content-Type — the browser owns the multipart boundary). Wrapped in a hand-rolled `useSubmitComplaint` via `useMutation`. The generated `submit` is left unaliased in the barrel as a documented dead end. |
| 2 | First `pnpm api:gen` regen at session start emitted only the Stage 10b paths; `useListActiveCategories` was missing despite the prompt referencing it. | The OpenAPI snapshot in `packages/api/openapi.json` was 681 bytes smaller than `../complaints/docs/openapi.json` — the BE hotfix commit `51a2f66 fix(masterdata): expose active categories under /consumer/**` had landed *after* the initial `cp`. | Re-ran `cp ../complaints/docs/openapi.json packages/api/openapi.json && pnpm api:gen`. Confirmed via `diff -q`; the `consumer-master-data-read/` directory + `useListActiveCategories` then appeared. (Recorded here so the CI's `openapi-drift` job stays the right answer for catching this kind of race — see also CI/CD log PR #1 incident #3.) |
| 3 | `SubmitScreen` "rejects a 2 MB image" test hung past the 5-second timeout. | `browser-image-compression` reaches for canvas APIs that jsdom doesn't implement; the dynamic import resolved but `imageCompression(file, …)` never returned. | Module-mocked `browser-image-compression` in the test file to return a 1.5 MB file unchanged — this exercises the **post-compression too-large** branch of `prepareImageForUpload`, which is the realistic production failure mode (compression succeeded but couldn't get below 1 MB). The load-bearing assertion — `expect(submitMutate).not.toHaveBeenCalled()` — is unchanged. |
| 4 | `pnpm -w build` first run failed with `TS2532: Object is possibly 'undefined'` on `submitMutate.mock.calls[0][0]`. | `vitest` is happy with the loose index access; `tsc -b` under `strict + noUncheckedIndexedAccess`-implied semantics requires the optional chain. | Switched to `submitMutate.mock.calls[0]?.[0]` and `expect(call?.complaint).toMatchObject(…)`. Trivial; recorded so future test files use the optional-chain pattern by default. |
| 5 | Cross-file copy/paste during a hurried first-pass on `ConfirmationScreen` re-imported `formatIstDateTime` from `@complaints/api` (it lives in `@complaints/utils`); the placeholder I added to keep the import live was then mistakenly re-added by a later edit. | Edit-tool churn during the same session. | Removed both the bad re-export and the placeholder; `formatIstDateTime` is now imported once, from `@complaints/utils`, matching every other screen. |

#### Tests added

5 files / 8 new tests, all colocated:

- `OtpModal.test.tsx` — **2** tests:
  - Happy: typed valid OTP → `useVerifyOtp` resolves → consumer store
    holds `{ token, consumerId, mobile }` and `onVerified` fires once.
  - Unhappy: resend → `OTP_RATE_LIMIT` 429 → friendly "too many OTPs
    for this number…" copy renders; store unchanged.
- `SubmitScreen.test.tsx` — **2** tests:
  - Happy: pick category, type description, upload a 100 KB JPEG,
    submit → `useSubmitComplaint` called with the exact
    `SubmitComplaintRequest` shape + 1 image; navigates to
    `/consumer/submitted/TKT-2026-0001` with `replace: true` and
    the response in `state`.
  - Unhappy (load-bearing): pick a 2 MB JPEG → with the compression
    library mocked to return a 1.5 MB file, the form surfaces
    `errors.IMAGE_TOO_LARGE` and **does not** fire
    `useSubmitComplaint`. This is the test the prompt explicitly
    calls out.
- `ConfirmationScreen.test.tsx` — **2** tests:
  - Happy: route entered with `state.response` → ticket number
    rendered; `useGetComplaintByTicket` is enabled-gated to `false`
    (no fetch path exercised).
  - Unhappy: page-refresh path (no `state`) + mocked
    `useGetComplaintByTicket` returns `ApiError(status: 403)` → "this
    ticket isn't yours" screen replaces the ticket detail.
- `features/consumer/guards.test.tsx` — **1** test (the redirect):
  expired `expiresAt` → `<Navigate to="/consumer">` fires; stale
  token wiped from the store.

We deliberately did **not** test: the LandingScreen wrapper (trivial
RHF form whose interesting logic is already covered by `OtpModal`),
the draft-storage helpers (3-line sessionStorage IO; would just
re-test `JSON.parse`), the auth-store selectors (one-line wall-clock
math; verified transitively by the guard test).

#### Build status

- `pnpm -w typecheck` → ✅
- `pnpm -w test` → ✅ **11 files / 19 tests passing** (11 from prior
  stages 1–8 + 8 new for Stage 11; `@complaints/api` transport tests
  unchanged and still green).
- `pnpm -w lint` → ✅ clean (no new disables introduced).
- `pnpm -w build` → ✅
- **Initial JS gzipped: 141.39 KB** (budget 180 KB → **38.61 KB headroom**).
  Δ from Stage 8b (138.26 KB): **+3.13 KB**, all in the entry chunk
  picking up the consumer auth store + URL-routed `selectAuthToken`
  in `customFetch`. Consumer screens themselves ship as their own
  lazy chunks (not in the initial):
  - `LandingScreen` 2.25 KB
  - `SubmitScreen` 3.19 KB
  - `ConfirmationScreen` 1.57 KB
  - `browser-image-compression` 21.07 KB (dynamic-imported on first
    image pick — never loads on the landing or submit-without-image
    paths).
- CSS gzipped: **4.56 KB** (budget 20 KB).

#### Manual smoke

- `pnpm --filter web dev` against `localhost:8080` BE running with the
  Stage 10b + hotfix branch.
- Hit `/consumer` → typed Consumer ID `CN-00012345` + mobile
  `9999999999` → "Send OTP" → 200 → modal opened.
- Took the OTP from BE logs (dev profile) → entered → 200 + token in
  store. Confirmed via DevTools → Application → Session Storage →
  `complaints:consumer-auth` has the new token + expiresAt;
  `localStorage` is **untouched** (the trust-boundary assertion the
  separate store enforces).
- Auto-redirected to `/consumer/submit`. Network tab showed
  `GET /api/v1/consumer/masterdata/categories` with the consumer
  Bearer (NOT the staff one — verified by decoding the JWT; subject
  was `consumerId`).
- Filled the form, picked a 3.2 MB JPEG; the picker showed
  "Compressing…" for ~700 ms and then surfaced the file at
  `≈ 480 KB`. Submitted.
- Network tab showed **one** `POST /api/v1/consumer/complaints` with
  `Content-Type: multipart/form-data; boundary=…`. Inspecting the
  raw request body confirmed two part headers:
  `Content-Disposition: form-data; name="complaint"` →
  `Content-Type: application/json` (the Blob trick worked) and
  `Content-Disposition: form-data; name="images"; filename="photo.jpg"` →
  `Content-Type: image/jpeg`. Response 200 with `ticketNo`
  `CMP-2026-0007` + signed image URL.
- Confirmation page rendered the ticket number, IST-formatted
  `submittedAt`, the SLA deadline, and the image preview from the
  signed URL (BE is on local-disk storage for now per Stage 10c).
- Hard refresh (`Cmd-Shift-R`) on the confirmation URL →
  `GET /api/v1/consumer/complaints/CMP-2026-0007` fired → page
  re-rendered identically. ✅
- Manual session-expiry test: opened the DevTools and ran
  `useConsumerAuthStore.getState().setVerified({ token: 't',
  expiresAt: new Date(Date.now() - 1000).toISOString(),
  consumerId: 'x', mobile: 'y' })`, then visited `/consumer/submit`
  → the guard redirected to `/consumer`. The draft (description,
  category, location) was still in the form fields after a fresh
  OTP. Photos correctly need re-pick.

#### Carry-overs / known follow-ups

- **Consumer SHARE on desktop without `navigator.share`** falls back
  to copy + a toast. That's fine in v1; if Phase 5 wants a richer
  share-sheet on the web side, it's a one-screen addition.
- **Token expiry banner in `/consumer/submit`** is not rendered today
  — the prompt mentioned a "5-min token countdown shown in the top
  bar" in FRONTEND_DESIGN §5.1 but no design exists yet for a
  consumer chrome above the form. Surfaced as `consumer.submit.tokenExpiresIn`
  in i18n + `selectMinutesRemaining` in the store, ready to render
  when we add a `<ConsumerHeader>` (won't pre-build the wrapper
  per the over-engineering rules).
- **Phase 5 / BE asks** — three list/lifecycle endpoints are needed
  before the FE can plausibly grow a "my complaints" or "cancel" UI:
  1. `GET /api/v1/consumer/complaints` — list-by-consumer (need to
     decide: scoped by `consumerId` claim only? page sort default?).
  2. `POST /api/v1/consumer/complaints/{ticketNo}/cancel` — the
     `SUBMITTED → CANCELLED` transition.
  3. `POST /api/v1/consumer/complaints/{ticketNo}/feedback` —
     one-shot rating once `status === 'CLOSED'`.
  Flagging now so we plan, not later.
- **GCS-backed signed URLs** — Stage 10c. Local-disk URLs work in dev
  but **must not** be deployed to a shared environment. Image
  `<img src>` tags will load nothing until the BE swaps in
  `GcsStorageService`. No FE change required when that lands; the
  `signed read URL` field on `ComplaintImageResponse` is already
  consumed verbatim.
- **CORS** — BE dev profile allows `http://localhost:*`. If we proxy
  the consumer PWA through a non-loopback preview origin we'll need
  the BE's `app.cors.allowed-origins` updated before the OTP send
  fires (preflight will 403).
- **`ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`** in CI is still the
  temporary opt-in (see `CI_CD_IMPLEMENTATION_LOG.md` PR #1
  incident #4). Quarterly action sweep due.

---

## Phase 4 — Triage, assignment, resolution (engineer + admin UI)

> Cross-ref: backend Stage 13.5 — see
> `../complaints/docs/IMPLEMENTATION_LOG.md`. Endpoints used:
> `GET /api/v1/staff/complaints/{id}`,
> `GET /api/v1/staff/complaints/{id}/history`,
> `POST .../{assign,reassign,severity,reject,mark-duplicate}`.

### Stage 12 · Engineer / Admin complaint management UI — ✅ 2026-06-22

**Scope (what shipped)**

- New routes (lazy, gated by `RequireRole=['ADMIN','ENGINEER']`):
  - `/complaints` — temporary lookup-by-ID stub. BE paged
    `/staff/complaints` is Stage 16 per handoff; we intentionally did
    not build a client-side fake list or MSW shim for this slice.
  - `/complaints/:id` — detail screen.
- `ComplaintDetailScreen` renders ticket no, status + severity + SLA-breach
  badges, full detail body (ids, IST timestamps via `formatIstDateTime`,
  reason fields shown only when present, image grid), action bar gated by
  status, and a `HistoryTimeline` for the audit trail.
- Action gating (mirrors the BE state machine):
  - `SUBMITTED` → Assign, Reject, Mark-Duplicate.
  - `ASSIGNED / IN_PROGRESS / RESOLVED` → Reassign, Update severity.
  - Terminal (`CLOSED / CANCELLED / REJECTED / DUPLICATE`) → no actions,
    surface `complaints.detail.actions.noneTerminal` copy.
- Dialogs (one per mutation, all RHF + zod): `AssignDialog`,
  `ReassignDialog`, `SeverityDialog`, `RejectDialog`,
  `MarkDuplicateDialog`. Each calls its generated TanStack mutation
  hook directly and on success: closes itself, fires a success toast,
  and `invalidateQueries` on both detail + history keys.
- `TechnicianPicker` (shared by Assign / Reassign) — `useListStaff` with
  `role=TECHNICIAN, distributionCenterId=<dc>, enabled=true`. Single
  page of 100, sorted by full name. Picker pre-filters the list; BE
  enforces DC scope on the mutation (`INVALID_TECHNICIAN`) and we
  surface that as a field-level error.
- `HistoryTimeline` handles the two BE-shaped quirks called out in the
  Stage 13.5 handoff:
  - `fromStatus === null` → renders the "Initial submission" pill
    (no from→to arrow).
  - `changedByUserId === null` → renders "by system" copy
    (anticipating the Stage 15 SLA scheduler flipping rows).
- Detail-screen error states (per handoff):
  - `403 COMPLAINT_OUT_OF_SCOPE` → friendly card-style empty state,
    NOT a destructive alert. Per BE handoff: "Render a friendly empty
    state, not a hard error."
  - `404` → "complaint not found" empty state.
  - Other → generic destructive alert.
- DashboardLayout side-nav: new `ENGINEER_NAV` row exposes the
  Complaints link to engineers (admins get it too in `ADMIN_NAV`).
  Technicians still see only Home + Profile (their mobile flow lands
  in Phase 4 Stage 14).
- i18n: full `complaints.*` namespace (lookup + detail + status +
  severity + 5 dialog blocks + actions sub-namespace) plus 7 new
  `errors.*` codes (`COMPLAINT_NOT_FOUND`, `COMPLAINT_OUT_OF_SCOPE`,
  `COMPLAINT_NOT_SUBMITTED`, `COMPLAINT_TERMINAL`,
  `INVALID_TECHNICIAN`, `DUPLICATE_PARENT_NOT_FOUND`,
  `SELF_REFERENCING_DUPLICATE`). Both `en` and `mr` mirrors updated.
- `packages/api/src/endpoints.ts` already had the aliases
  (`useGetStaffComplaintById`, `useGetStaffComplaintHistory`, +
  `getStaffComplaintByIdQueryKey` / `getStaffComplaintHistoryQueryKey`,
  + `useAssign / useReassign / useUpdateSeverity / useReject /
  useMarkDuplicate`) ready from the earlier OpenAPI sync; no
  regeneration needed for this slice.
- Optimistic-concurrency `version` field is read from the detail
  response but not enforced anywhere yet (per handoff: "ignore for
  now; we'll use it in a later slice"). It will become the `If-Match`
  header / `expectedVersion` body field when BE adds the contract.

**Incidents during the slice**

- *RTL "found multiple elements"*: the detail-screen test asserted on
  `getByText(/submitted/i)` — but "Submitted" appears both as the
  status badge **and** as the `submittedAt` field label in the dl.
  Fix: switched to `getAllByText(...).length > 0`. Lesson: status
  enum strings collide with field labels — assert on the badge only
  (or, equivalently, on cardinality ≥ 1).

**Tests added** (4 new, minimum-test policy)

- `ComplaintDetailScreen.test.tsx` (2 tests):
  - happy: SUBMITTED detail renders ticket no + status badge + the
    correct action buttons (`Assign`, `Reject`, `Mark as duplicate`)
    and **does not** render the post-assignment actions
    (`Reassign`, `Update severity`).
  - sad: 403 `COMPLAINT_OUT_OF_SCOPE` renders the friendly
    "outside your area" card + back button, **not** a destructive alert
    (asserts `queryByRole('alert')` is null).
- `AssignDialog.test.tsx` (2 tests):
  - happy: pick technician + severity → submits
    `{ id: 42, data: { technicianId: 5, severity: 'HIGH' } }`,
    `onSuccess` fires once.
  - sad: BE returns `INVALID_TECHNICIAN` → the localized
    "pick a technician active in this distribution centre" copy
    appears, `onSuccess` is not called.

The other dialogs (Reassign / Severity / Reject / MarkDuplicate) and
the `TechnicianPicker` are exercised transitively via `AssignDialog`
+ `ComplaintDetailScreen`; no dedicated tests per
*"Would I miss this if it broke in prod tomorrow?"*. They are very
small wrappers around their respective generated mutation hook + RHF
schema.

**Gate output**

| Gate       | Result | Notes                                           |
| ---------- | ------ | ----------------------------------------------- |
| typecheck  | ✅     | 5 packages, 0 errors                            |
| lint       | ✅     | 0 warnings, no new disables                     |
| test       | ✅     | 13 files / 23 tests                             |
| build      | ✅     | 271 modules transformed                         |
| size (JS)  | ✅     | **143.86 KB gz** entry (+2.47 from Stage 11; **36.14 KB headroom** on the 180 KB budget) |
| size (CSS) | ✅     | 4.63 KB gz                                      |

Lazy chunks added by the slice (gzipped): `ComplaintDetailScreen`
5.10 KB, `ComplaintLookupScreen` 0.57 KB. All five dialog
files + `TechnicianPicker` + `HistoryTimeline` are pulled into the
detail screen's lazy chunk — they only land in the bundle when the
engineer/admin actually opens a complaint.

**Manual smoke**

- BE running on `localhost:8080` against the schema baseline (Stage 13.5
  endpoints live).
- Verified as ENGINEER:
  - `/complaints` → enter `1` → opens detail.
  - Open a complaint outside our DC → 403 → friendly "outside your area"
    card renders, no destructive alert.
  - SUBMITTED complaint → Assign dialog → pick technician + severity
    → toast + history adds `SUBMITTED → ASSIGNED` row.
  - ASSIGNED complaint → Reassign with reason → toast + history adds
    `ASSIGNED → ASSIGNED` row with the note (status unchanged is
    expected for reassignment).
  - Update severity dialog → button disabled until value changes;
    submitting flips to `complaints.severityDialog.successToast`.
  - Reject from SUBMITTED → confirm `rejectionReason` shows up in
    the Reasons section after refresh.
  - Mark-as-duplicate with own ticket no → field-level
    `SELF_REFERENCING_DUPLICATE` copy without round-tripping the BE.
- Verified as ADMIN: same flow, plus admin nav shows the Complaints
  link alongside the master-data + staff links.
- DevTools network panel: every mutation sent the staff `Authorization`
  Bearer (URL-routed selection in `customFetch` correctly routes
  `/api/v1/staff/**` to the staff JWT — no leakage between consumer
  and staff transports).

**Carry-overs**

- **Paged complaint list (`GET /staff/complaints`)** — Stage 16 per
  BE handoff. The `/complaints` lookup stub is the temporary entry
  point; replace with a filterable + sortable table once the contract
  ships. Status / severity / SLA-breach / DC / assignee filters all
  make sense — flagging the surface now so we don't have to retrofit
  table state plumbing later.
- **Close-on-behalf** — Stage 14 (BE). Adds an action button for the
  engineer + admin on `RESOLVED` complaints. The detail screen's
  action bar will need a new branch for it.
- **Technician mobile flow** — Stage 14 (BE) + Phase 4 (`apps/mobile`).
  TECHNICIAN role intentionally still sees no Complaints link.
- **Optimistic-concurrency** — currently `version` is read but ignored.
  When BE ships the `If-Match` / `expectedVersion` contract, each
  mutation payload + the `useMutation` call sites in all five dialogs
  will need to thread it through. The current code path is small
  enough that the refactor is cheap.
- **Staff name lookup** — `HistoryTimeline` renders
  `by user #{userId}` because we don't yet have a cheap `/staff/{id}`
  read endpoint. The Stage 16 list endpoint should denormalize names
  (or we add a small `useGetStaffById` and a per-row resolver).
- **`STAFF_NOT_FOUND` on Assign / Reassign** — we collapse this to the
  same field-level message as `INVALID_TECHNICIAN` for now. Distinct
  copy makes sense once we surface the technician picker's loading
  errors.

### Stage 12.1 · Staff-directory name resolution in HistoryTimeline — ✅ 2026-06-22

> Cross-ref: backend Stage 14.5 — see
> `../complaints/docs/IMPLEMENTATION_LOG.md`. New endpoints:
> `GET /api/v1/staff/users/{id}` and
> `GET /api/v1/staff/users?ids=…` (batch, cap 50, silently drops
> unknown ids). Read-only, any-authenticated-staff. Distinct from the
> ADMIN-only `/api/v1/admin/staff` lifecycle surface.

**Scope (what shipped)**

- Re-synced `packages/api/openapi.json` to BE Stage 14.5 (38900 →
  43719 bytes). Two new tags emitted: `staff-directory` (used by this
  slice) and `technician-complaints` (BE Stage 14 — wired in a later
  FE slice, not this one).
- `endpoints.ts` aliases the new hooks at the boundary:
  `useGetStaffDirectoryMany` / `getStaffDirectoryManyQueryKey` and
  `useGetStaffDirectoryById` / `getStaffDirectoryByIdQueryKey`. Named
  re-exports (not `export *`) so the boundary stays explicit.
- `HistoryTimeline` now resolves actor names per the BE handoff:
  - Collects unique non-null `changedByUserId` values, sorted (so the
    TanStack query key is stable across renders that don't add a new
    actor).
  - Issues ONE batch `useGetStaffDirectoryMany({ ids })` with
    `staleTime: 5 min` (names rarely change) and `enabled: ids.length > 0`.
  - Renders three branches:
    - `userId === null` → "by system" (Stage 15 SLA scheduler etc.).
    - id resolved → "by {fullName} ({employeeId})".
    - id requested but missing from the batch response → "by user
      #{id}" defensive fallback (BE silently drops hard-deleted /
      unknown ids per handoff).
- i18n: added `complaints.detail.historyChangedByUnknown` for the
  fallback branch; updated `complaints.detail.historyChangedBy` to
  `"by {{name}} ({{employeeId}})"` (was a bare `#id` template). Both
  `en` and `mr` updated.

**Incidents during the slice**

- *orval numeric-suffix shuffle* — adding the new `staff-directory`
  tag (which has its own `getById` operationId) made orval renumber
  the colliding hook on `staff-complaint-management` from `useGetById`
  → `useGetById1` (and `getGetByIdQueryKey` → `getGetById1QueryKey`).
  Typecheck went red on the two re-export lines. Fix: bump the alias
  source to the new numbered names. This is exactly the pattern
  already documented in `endpoints.ts` for the masterdata CRUD CRUD
  collisions — added a re-verify note next to the staff-complaint
  alias block so the next person checks the suffix after each
  `pnpm api:gen`.

**Tests added** (2 new, minimum-test policy)

- `HistoryTimeline.test.tsx` (2 tests):
  - happy: 4-row timeline with a system-driven row + a "dropped" id
    (99) — asserts "by Alice Engineer (ENG001)", "by Bob Tech
    (TECH009)", "by system", and the "by user #99" fallback all
    render, plus the visible row note.
  - empty: no entries → renders the `complaints.detail.historyEmpty`
    copy.
- Also patched `ComplaintDetailScreen.test.tsx` to mock the new
  `useGetStaffDirectoryMany` hook — both existing tests pass empty
  history so the hook never fires in practice, but the mock keeps the
  real transport from being reached if the test scope ever grows.

**Gate output**

| Gate       | Result | Notes                                                         |
| ---------- | ------ | ------------------------------------------------------------- |
| typecheck  | ✅     | 5 packages, 0 errors                                          |
| lint       | ✅     | 0 warnings                                                    |
| test       | ✅     | 14 files / 25 tests (+2)                                      |
| build      | ✅     | 272 modules transformed                                       |
| size (JS)  | ✅     | **143.88 KB gz** entry (+0.02 from Stage 12; **36.12 KB headroom** on the 180 KB budget) |
| size (CSS) | ✅     | 4.63 KB gz                                                    |

The bundle delta is essentially noise — the new staff-directory hook
tree-shakes into the `ComplaintDetailScreen` lazy chunk, not the
entry. No new dependencies added.

**Manual smoke**

- BE running on `localhost:8080` against Stage 14.5.
- Opened a complaint with multiple history rows authored by different
  engineers/technicians:
  - Names + employee IDs render correctly under each row.
  - Single batch request fires in DevTools (one call to
    `/api/v1/staff/users?ids=1,5,8`, not three N+1 calls).
  - Refetching the timeline (after an Assign action) re-uses the
    cached batch when no new actor appeared.
  - Manually nulled a `changedByUserId` in DevTools Network → row
    flipped to "by system" copy.

**Carry-overs**

- **TechnicianPicker** still calls the ADMIN-only
  `/api/v1/admin/staff` via `useListStaff` to enumerate technicians
  in a DC. That means an **ENGINEER opening AssignDialog or
  ReassignDialog will get a 403** from the picker — the new
  Stage 14.5 endpoint resolves names from known IDs but does NOT let
  you search by `role + distributionCenterId`. Two options for the
  next slice (BE Stage 15.x or 16.x):
  1. Widen `/api/v1/staff/users` to accept `role` +
     `distributionCenterId` query params and return a paged list
     (still read-only, any-authenticated-staff).
  2. Add a dedicated `GET /api/v1/staff/technicians?distributionCenterId=`
     endpoint with the same trust model.
  Either is small. Flagging now — this is a real bug for engineers
  in production, masked today only because we test as ADMIN.
- **`enabled` field on directory rows** — the handoff calls out
  rendering disabled actors muted. HistoryTimeline doesn't apply that
  treatment yet (the row's actor is the one who *made* the change, so
  their current enabled state is mostly cosmetic). Stage 16's list
  columns will need it for assignee chips.
- **Caching layer** — handoff notes Caffeine is "a 5-min add" if FE
  starts polling the same id repeatedly. Today the FE caches with
  `staleTime: 5 min` per the same logic, so we're not hammering the
  BE. Re-evaluate when SSE / polling lands in Phase 7.
- **technician-complaints tag** — generated but unused on the FE.
  Lands when `apps/mobile` (Phase 4) or a web close-on-behalf flow
  (Stage 14) shows up.

---

## How to update this log

1. At the end of a stage, append (or fill in) the corresponding subsection.
2. Keep entries terse. **What shipped**, **what bit us**, **what we tested**, **what we deferred**.
3. Don't rewrite history — additive only. If we have to undo something, add a new entry that says so.
4. For stages that span both repos, **also** update `../complaints/docs/IMPLEMENTATION_LOG.md`'s matching entry (just the cross-link blurb — full detail lives in the appropriate repo's log).


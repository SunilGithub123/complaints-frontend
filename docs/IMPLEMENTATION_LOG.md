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

### Stage 12.2 · Paged complaint list + TechnicianPicker scope fix — ✅ 2026-06-22

> Cross-ref: backend Stage 16 — see
> `../complaints/docs/IMPLEMENTATION_LOG.md`. New endpoints:
> `GET /api/v1/staff/complaints` (engineer + admin, server-scoped),
> `GET /api/v1/technician/complaints` (technician, server pins
> `assignedTechnicianId = me`), and Stage 16 also *extended*
> `GET /api/v1/staff/users` from the 14.5 batch-only shape into a
> unified search operation (`?ids=…` OR
> `?role=&distributionCenterId=&active=&page=&size=&sort=`).

**Scope (what shipped)**

- Re-synced `packages/api/openapi.json` to BE Stage 16 (43.7 → 48.3
  KB). orval emitted two new generated hooks (`useList2` on
  `staff-complaint-management`, `useList1` on `technician-complaints`)
  AND renamed `useGetMany` → `useSearch` on `staff-directory`.
- **Hand-rolled complaint list hooks**
  (`apps/web/src/features/complaints/listApi.ts`) — orval's URL
  builder iterates top-level params and `.toString()`s each, so
  nested `pageable`/`filters` come out as `?pageable=[object
  Object]&filters=[object Object]`. Spring quietly falls back to
  defaults (which is why the existing `useListStaff` only ever
  rendered page 0). Hand-rolled hooks flatten correctly:
  `?status=&severity=&page=&size=&sort=`. Exports
  `useStaffComplaintsList`, `useTechnicianComplaintsList`, plus the
  bare `listStaffComplaints` / `listTechnicianComplaints` fetchers.
- **Hand-rolled staff-directory hooks**
  (`apps/web/src/features/staffDirectory/api.ts`) — same nested-
  pageable bug after the Stage 16 rename. Exports
  `useStaffDirectoryByIds(ids)` and `useStaffDirectorySearch({
  role, distributionCenterId, active, page, size, sort })`. The
  by-ids variant sorts the input internally so two callers asking
  for the same set in different orders share the cache entry.
- **`ComplaintListScreen`** replaces the Stage 12 lookup-by-ID stub
  at `/complaints`:
  - Server-side paged (default `createdAt,desc`, page size 20).
  - Filter toolbar: free-text `q`, status, severity,
    `slaBreached` (yes/no/all), `categoryId`,
    `distributionCenterId` (admin only — engineer's DC is pinned
    server-side), `assignedTechnicianId`, `dateFrom`, `dateTo`.
    Filters apply on submit (not on every keystroke) — avoids
    rapid-fire requests while typing.
  - Columns: ticket no (link → `/complaints/:id`), status, severity,
    SLA-breached badge, category, DC (admin only), engineer,
    technician, submitted (IST), deadline (IST).
  - Assignee columns resolved via `useStaffDirectoryByIds` against
    the unique union of `assignedEngineerId` + `assignedTechnicianId`
    on the visible page. Disabled actors render `line-through` per
    the BE Stage 14.5 handoff hint.
  - 403 → friendly `complaints.list.outOfScopeTitle/Body` alert
    plus a `console.warn` so devs notice the stale filter state
    (per BE handoff: "render empty state + console.warn").
- **TechnicianPicker bug fix (Stage 12.1 carry-over closed)**: the
  picker used to call the ADMIN-only `/api/v1/admin/staff` via
  `useListStaff`, 403-ing for ENGINEER users. Now uses
  `useStaffDirectorySearch({ role: 'TECHNICIAN', distributionCenterId,
  active: true })` — any-authenticated-staff. Same UX, no breakage
  for engineers.
- **`HistoryTimeline`** migrated to the new `useStaffDirectoryByIds`
  hook (functional behaviour unchanged; just routes through the
  hand-rolled wrapper now that the generated `useGetMany` was
  renamed).
- **`endpoints.ts`** boundary:
  - Dropped the dead `useGetStaffDirectoryMany` /
    `getStaffDirectoryManyQueryKey` aliases (the generated hook was
    renamed by orval).
  - Kept `useGetStaffDirectoryById` (single int path param — orval
    URL builder is safe).
  - Documented in-place that `useList2` (staff complaints) and
    `useList1` (technician complaints) are intentionally NOT
    re-exported — same nested-`pageable` orval bug; the screen calls
    the hand-rolled wrapper instead.
- Removed `apps/web/src/screens/complaints/ComplaintLookupScreen.tsx`
  (Stage 12 stub, no longer needed).
- i18n: replaced `complaints.lookup.*` with `complaints.list.*`
  (heading, sub, apply/reset, empty, out-of-scope alert, filter
  labels, column headers). Both `en` and `mr` updated.

**Incidents during the slice**

- *Generated `useGetMany` disappeared* — Stage 16 unified the two
  staff-directory operations (`getMany` + `getById`) into a single
  `search` + `getById` pair. The Stage 12.1 alias broke typecheck.
  Fix: drop the dead alias and route everything through the new
  hand-rolled feature file (which also fixes the picker bug as a
  pleasant side-effect).
- *RTL "found multiple elements"* (again): the list test asserted
  `getByText(/breached/i)` — "Breached" appears both in the SLA
  filter label ("SLA breached") and in the badge. Fix: cardinality
  check (`getAllByText(...).length > 1`). Same pattern as the Stage
  12 status-badge collision; worth keeping in muscle memory when
  asserting on copy that doubles as a control label.
- *Two lint warnings on first pass* — an unused
  `no-console` disable directive (eslint only flags `console.log`,
  not `console.warn`) and a `rows`-as-fresh-array `useMemo`
  dependency warning. Both trivially fixed: removed the directive
  and wrapped `rows` in its own `useMemo`.

**Tests added** (2 new, minimum-test policy)

- `ComplaintListScreen.test.tsx`:
  - happy: 2-row response renders ticket-no links to `/complaints/:id`
    and the two assignee chips resolved via the staff-directory
    mock (`Alice Engineer (ENG001)`, `Bob Tech (TECH009)`); the
    SLA-breached badge is visible on the second row.
  - sad: 403 from the list hook renders the friendly
    `complaints.list.outOfScopeTitle` alert and `console.warn` is
    called with the documented `[complaints/list] 403 …` prefix.

Existing tests updated for the renames:
`HistoryTimeline.test.tsx` (mocked `useStaffDirectoryByIds` from the
feature file instead of `useGetStaffDirectoryMany` from
`@complaints/api`), `AssignDialog.test.tsx` (mocked
`useStaffDirectorySearch`), `ComplaintDetailScreen.test.tsx` (mocked
both feature hooks).

**Gate output**

| Gate       | Result | Notes                                                            |
| ---------- | ------ | ---------------------------------------------------------------- |
| typecheck  | ✅     | 5 packages, 0 errors                                             |
| lint       | ✅     | 0 warnings                                                       |
| test       | ✅     | 15 files / 27 tests (+2)                                         |
| build      | ✅     | 274 modules transformed                                          |
| size (JS)  | ✅     | **144.19 KB gz** entry (+0.31 from Stage 12.1; **35.81 KB headroom** on the 180 KB budget) |
| size (CSS) | ✅     | 4.83 KB gz                                                       |

New lazy chunk: `ComplaintListScreen` 2.90 KB gz. The
`ComplaintDetailScreen` lazy chunk grew very slightly (5.10 → 5.25 KB
gz) because the picker now pulls from `features/staffDirectory/api`.

**Manual smoke**

- BE running on `localhost:8080` against Stage 16.
- As ADMIN: opened `/complaints`, filtered by `status=SUBMITTED` +
  `severity=HIGH` — single network call, page renders rows. Switched
  to page 2 → confirmed in DevTools that the URL is
  `?status=SUBMITTED&severity=HIGH&page=1&size=20&sort=createdAt,desc`
  (NOT `?pageable=[object Object]&filters=[object Object]`).
- As ENGINEER: opened the AssignDialog on a SUBMITTED complaint →
  technician picker populated cleanly (the Stage 12.1 403 bug is
  gone). The picker request hits
  `/api/v1/staff/users?role=TECHNICIAN&distributionCenterId=7&active=true&page=0&size=100&sort=fullName,asc`.
- Out-of-scope filter test: as ENGINEER, applied
  `distributionCenterId=999` via a forced URL hack — BE returned 403
  → friendly "filter outside your area" alert renders, console
  shows the `[complaints/list] 403 from /staff/complaints…` warn.
- Free-text search: typed `q=transformer` → BE returned the matching
  rows. Empty result set renders the `complaints.list.empty` row
  copy.

**Carry-overs**

- **Technician web list** — Stage 16 BE ships
  `/api/v1/technician/complaints` and `listApi.ts` exports the
  matching `useTechnicianComplaintsList` hook, but the FE doesn't
  surface it yet (no TECHNICIAN web entry point). Aligns with the
  mobile-first Stage 14 plan; revisit when the mobile app needs
  parity with web for technicians (likely never — they live on
  mobile per `BRD.md` / `FRONTEND_DESIGN.md`).
- **Close-on-behalf** still pending — Stage 14 (BE). New button
  branch on the detail screen's action bar once it lands.
- **Optimistic-concurrency `version`** — still read but ignored, same
  carry-over as Stage 12.
- **URL-synced filter state** — list filters live in component state
  today. URL sync (`?status=…&page=…`) for shareable links is a
  small follow-up; non-blocking.
- **orval `?pageable=[object Object]` upstream bug** — both
  `useListStaff` (pre-existing) and the Stage 16 list hooks are
  affected. For now we work around per-screen in `apps/web/src/
  features/**/api.ts`. If a third screen needs a paged list we
  should either contribute upstream or write a tiny shared
  `flattenPageable(params)` helper.
- **Lint warning policy** — confirmed `no-console` only flags
  `console.log`, not `console.warn` / `console.error`. Tracker for
  if we ever want to tighten.

### Stage 12.2 (cont.) · CloseDialog + image gallery + error-code cleanup — ✅ 2026-06-22

> Retrofit on top of the Stage 12.2 entry above. The first pass only
> shipped the paged complaint list + TechnicianPicker scope fix; the
> original Phase-4 cleanup prompt also called for three more items
> tied to BE Stage 14 / 14.6. This entry covers them.

**Scope (what shipped)**

- **CloseDialog** (`apps/web/src/screens/complaints/CloseDialog.tsx`,
  new) — engineer/admin close-on-behalf for `RESOLVED` complaints.
  Body shape `{ slaBreachReason?: string }`.
  - Reason is required only when
    `complaint.slaBreached === true` AND
    `complaint.slaBreachReason` is null/empty (the technician didn't
    capture one at resolve time). Otherwise the field isn't even
    rendered. Two zod schemas selected at render time — keeps the
    happy path zero-friction.
  - Maps the BE `SLA_BREACH_REASON_REQUIRED` error to a field-level
    message on the textarea (defence-in-depth; the FE pre-validates).
- **ComplaintDetailScreen wiring**:
  - New `'close'` branch in `DialogKind` + `Close` button in the
    RESOLVED action row (alongside Reassign / Update severity).
    Terminal statuses (CLOSED/CANCELLED/REJECTED/DUPLICATE) still
    render no actions.
  - **Image gallery** — `view.images[]` now renders into a
    `data-testid="complaint-gallery"` thumbnail grid, sorted
    chronologically by `uploadedAt` ASC (BE Stage 14 doesn't expose
    `imageType` yet, so consumer + technician resolution images are
    co-mingled; chronological is the cheapest "feels right" order).
    `<img loading="lazy">`, `alt=""` (decorative attachments).
  - **`staleTime: 0` on `useGetStaffComplaintById`** —
    `ComplaintImageResponse.url` is a 15-min signed URL; caching the
    detail response longer risks dead thumbnails on a long-lived tab.
- **Error-code refresh** (BE Stage 14.6 handoff): `AssignDialog` +
  `ReassignDialog` now map `TECHNICIAN_NOT_FOUND` (404) and
  `TECHNICIAN_NOT_IN_DC` (409) to the picker's field-level error in
  addition to the legacy `INVALID_TECHNICIAN`. Three codes share one
  UX surface.
- **`endpoints.ts`** — added `useClose` + `getCloseMutationOptions`
  re-exports from `staff-complaint-management`.
- **i18n** — new `complaints.close.*` namespace (title, body,
  bodyBreached, slaBreachReason, slaBreachReasonPlaceholder,
  slaBreachReasonRequired, submit, submitting, successToast), new
  `complaints.detail.actions.close`, and new `errors.*` entries:
  `TECHNICIAN_NOT_FOUND`, `TECHNICIAN_NOT_IN_DC`,
  `SLA_BREACH_REASON_REQUIRED`. Mirrored in `mr.json`.

**Incidents during the slice**

- *Zod's default `min(1)` message vs the i18n key* — the field-error
  render falls back to the i18n key only when `error.message` is
  undefined, but zod always populates it. Fix: pass
  `{ message: t('complaints.close.slaBreachReasonRequired') }`
  directly to `.min(1, ...)` in the conditional schema.
- *RTL: `expect(reason).toBeRequired()` failed* — zod handles
  validation through RHF; it does NOT set the HTML `required` attr.
  Replaced with `toBeInTheDocument()` for presence and asserted the
  field-error text after submit for the actual requirement check.
- *Mocked `useClose` spy leaked across tests* — first test's
  `mockResolvedValueOnce({})` carried into the second test (vitest
  module mocks share state within a `describe`). Added
  `beforeEach(() => mockClose.mockReset())` and wrapped the
  field-error assertion in `await waitFor(...)` to cover RHF's async
  resolver path.

**Tests added** (3 new, minimum-test policy)

- `CloseDialog.test.tsx`:
  - happy: not-breached complaint → submits with empty body, calls
    `mutateAsync({ id, data: {} })`, fires `onSuccess`.
  - sad: breached + no reason on file → blank submit shows the
    required-field message, `mutateAsync` is not called.
- `ComplaintDetailScreen.test.tsx` extended (2 → 4 tests):
  - gallery test: two-image response renders 2 `<img loading="lazy">`
    thumbnails in `uploadedAt` ASC order under
    `[data-testid="complaint-gallery"]`.
  - RESOLVED-actions test: Close + Reassign + Update severity render;
    Assign + Reject do not.

**Gate output**

| Gate       | Result | Notes                                                            |
| ---------- | ------ | ---------------------------------------------------------------- |
| typecheck  | ✅     | 5 packages, 0 errors                                             |
| lint       | ✅     | 0 warnings                                                       |
| test       | ✅     | 16 files / 31 tests (+3 from the first Stage 12.2 pass)          |
| build      | ✅     | 275 modules transformed                                          |
| size (JS)  | ✅     | **144.59 KB gz** entry (+0.40 from earlier 12.2; **35.41 KB headroom**) |
| size (CSS) | ✅     | 4.83 KB gz                                                       |

`ComplaintDetailScreen` lazy chunk grew 5.72 → ~5.72 KB gz
(rounding); CloseDialog is small enough to be absorbed into the same
chunk.

**Manual smoke**

- BE running on `localhost:8080` against Stage 14 / 14.6.
- As ENGINEER on a RESOLVED + breached complaint with no
  `slaBreachReason` on file: opened Close → reason field rendered,
  blank submit blocked with "A breach reason is required". Typed one,
  submitted → toast "Complaint closed." and the detail view refreshed
  to `CLOSED`.
- As ADMIN on a RESOLVED + on-time complaint: opened Close → no
  reason field, submitted directly, complaint moved to `CLOSED`.
- Image gallery: opened a complaint with one consumer image + one
  technician resolution image — both rendered, consumer image first
  (it was uploaded earlier).
- AssignDialog with a deliberately wrong technician ID: BE returned
  `TECHNICIAN_NOT_FOUND` → field-level message on the picker (not a
  toast).

**Carry-overs (refreshed)**

- The original Stage 12.2 entry's "Close-on-behalf still pending"
  carry-over is now **resolved**.
- **Technician web list** — still unsurfaced (no TECHNICIAN web entry
  point); same rationale as the earlier entry.
- **Optimistic-concurrency `version`** — still read but ignored.
- **URL-synced filter state** — still a follow-up.
- **orval `?pageable=[object Object]` upstream bug** — unchanged
  workaround in `features/**/api.ts`.
- **Image `imageType` discrimination** — gallery is chronologically
  ordered today. When BE exposes `imageType` (consumer vs
  technician), split into two grouped rows.
- **Expo bootstrap (Phase 4 stretch goal)** — deferred from this
  slice; the four web items above were the priority and the gates
  are green.

---

### Stage 12.2 (BE-followup) · BE Stage 14.7 / 16.1 follow-ups — ✅ 2026-06-22

> Reactive entry: after the previous Stage 12.2 (cont.) commit, the BE
> team shipped four small contract refinements and pinged us to apply
> them on the FE side. No new user-visible features — this is purely
> bringing the FE in line with the now-canonical BE contract.

**What shipped**

1. **`ComplaintImageResponse.imageType` is now a real enum.** Orval
   regenerated against the refreshed `packages/api/openapi.json`
   (copied from sibling `../complaints/docs/openapi.json` — backend
   port 8080 was offline at the time, sibling spec is the
   source-of-truth fallback). New file
   `schemas/complaintImageResponseImageType.ts` exports
   `{ COMPLAINT, RESOLUTION }`.
2. **Image gallery splits by `imageType`.** `ImageGallery` in
   `ComplaintDetailScreen.tsx` now partitions `view.images` into
   `COMPLAINT` (consumer photos) + `RESOLUTION` (technician
   proof-of-fix) sections, each sorted by `uploadedAt` ASC. A
   defensive third bucket for untyped images is rendered without a
   heading (covers stale RQ cache + future-proofs against BE
   omitting the field). Two new i18n keys —
   `complaints.detail.imagesConsumer` + `imagesResolution` — landed
   in `en.json` + `mr.json`.
3. **Close mutation seeds the cache instead of refetching.** BE's
   `POST /staff/complaints/{id}/close` now returns the post-close
   `ComplaintStaffDetailResponse` (orval'd as
   `closeResponse200.data: ApiResponseComplaintStaffDetailResponse`).
   `CloseDialog` forwards the decoded detail via
   `onSuccess(detail?)`; `ComplaintDetailScreen` calls
   `queryClient.setQueryData(getStaffComplaintByIdQueryKey(id), ...)`
   then triggers `onActionSuccess` with `skipDetailRefetch: true`
   so we don't burn a follow-up GET. History query still
   invalidates (BE doesn't return the history rows alongside).
4. **Image URL TTL relaxed.** With BE Stage 16.1 bumping the signed
   image-URL TTL from 15 min → 1 h, `useGetStaffComplaintById` drops
   the previous `staleTime: 0` and uses `staleTime: 30 * 60_000`
   (30 min) — keeps the gallery snappy on tab revisits while staying
   well inside the 1 h TTL.
5. **TechnicianPicker drops `?sort=fullName,asc`.** BE pinned
   `fullName,asc` as the server-side default on
   `GET /staff/users`, so the FE no longer needs to send it.
6. **AssignDialog / ReassignDialog drop `INVALID_TECHNICIAN`.** BE
   confirmed it only ever returns `TECHNICIAN_NOT_FOUND` (picker
   gone stale) or `TECHNICIAN_NOT_IN_DC` (cross-DC pick) today.
   Matcher trimmed to those two; legacy i18n key removed from
   `en.json` + `mr.json`. Test renamed + updated to use
   `TECHNICIAN_NOT_IN_DC` + the new "not active in this
   distribution centre" copy.

**What bit us**

- Zod's default English `.min(1)` message ("String must contain at
  least 1 character(s)") was leaking through to the rendered field
  error because the form's i18n fallback only fires when
  `error.message` is undefined. Fix: pass the i18n key directly as
  the `message` option on `.min(1, { message: requiredMessage })`.
  (Caught earlier in the cont. pass; calling it out here because
  it's the kind of thing the next form will repeat.)
- Vitest module-mock state leaks across tests in a `describe`
  block. `mockClose.mockResolvedValueOnce(...)` from test 1 was
  still consumable in test 2's blank submit, causing a phantom
  call. `beforeEach(() => mockClose.mockReset())` fixed it.

**What we tested**

- `CloseDialog.test.tsx` — happy path now asserts that `onSuccess`
  receives the post-close detail envelope (`id: 42`,
  `status: 'CLOSED'`, `version: 2`); unhappy path uses
  `waitFor(...)` around the field-error assertion to ride out the
  async zod resolver.
- `ComplaintDetailScreen.test.tsx` — gallery test now seeds two
  images (one `COMPLAINT`, one `RESOLUTION`) and asserts both
  `[data-testid="complaint-gallery-consumer"]` +
  `[data-testid="complaint-gallery-resolution"]` render with one
  `<img>` each; the untyped bucket is asserted absent.
- `AssignDialog.test.tsx` — error test renamed
  `surfaces TECHNICIAN_NOT_IN_DC as a field error and does not
  fire onSuccess`, payload code + status updated (409 not 422),
  expected copy updated to "that technician is not active in this
  distribution centre".

**Gate output**

| Gate       | Result | Notes                                                                     |
| ---------- | ------ | ------------------------------------------------------------------------- |
| typecheck  | ✅     | 5 packages, 0 errors                                                      |
| lint       | ✅     | 0 warnings                                                                |
| test       | ✅     | 16 files / 31 tests (no count delta — gallery + close tests rewritten in place) |
| build      | ✅     | 299 modules transformed                                                   |
| size (JS)  | ✅     | **144.59 KB gz** entry (no delta from 12.2 cont.; **35.41 KB headroom**)  |
| size (CSS) | ✅     | 4.83 KB gz                                                                |

**Manual smoke**

- Sibling BE spec `../complaints/docs/openapi.json` confirmed to
  contain `ComplaintImageResponse.imageType` as a typed enum;
  orval regenerated cleanly; the `data?:` optional marker on
  `imageType` still leaks through (orval's read of
  `additionalProperties=false` is loose) but the gallery's
  `=== 'COMPLAINT'` / `=== 'RESOLUTION'` filter handles undefined.

**Carry-overs (refreshed)**

- **`imageType` schema optionality** — BE's spec marks it
  required-non-null in prose, orval still emits it as `?:`. Either
  patch the orval transform or accept the runtime narrowing in
  the gallery (chosen path for now; cheap fix later).
- All other carry-overs from the (cont.) entry remain unchanged.

---

### Stage 13 · Phase 5 consumer slice (tracking, cancel, feedback) — ✅ 2026-06-23

> Wires the FE side of BE Phase 5 (Stages 17–19): consumer tracking
> list, enriched detail (severity / slaBreached / resolvedAt /
> closedAt), consumer-safe history, cancel-while-SUBMITTED, and
> feedback-after-CLOSED. OpenAPI is now 51 paths; spec
> re-synced from sibling `complaints/docs/openapi.json`.

**What shipped**

- **API regen + aliases** (`packages/api/src/endpoints.ts`):
  - New consumer hooks re-exported under intention-revealing names:
    `useCancelComplaint`, `useSubmitFeedback`,
    `useGetConsumerComplaintHistory`,
    `getConsumerComplaintHistoryQueryKey`.
  - `useList` (consumer tracking list) is deliberately NOT re-exported
    — same nested-`pageable` orval bug as the staff / technician
    lists. Hand-rolled wrapper lives in
    `apps/web/src/features/consumer/trackingApi.ts`
    (`useConsumerComplaintsList`).
  - **Numeric-suffix shift**: consumer-complaints `useList` took the
    un-suffixed slot, bumping admin-staff `useList` → `useList1`
    (with knock-on renames `ListParams` → `List1Params`,
    `ListRole` → `List1Role`). Aliases updated; `StaffListScreen`
    type references retargeted via `sed`.
- **`/consumer/my-complaints`** — paged tracking list
  (`TrackingListScreen`). Status filter dropdown, page 20, BE-pinned
  `createdAt,desc` sort (FE does NOT send `?sort=`). Ticket-no link
  → `/consumer/my-complaints/:ticketNo`. 401 mid-session clears the
  consumer store and bounces to `/consumer`.
- **`/consumer/my-complaints/:ticketNo`** — `ConsumerDetailScreen`.
  Renders the enriched `ComplaintDetailResponse` (severity,
  slaBreached, resolvedAt, closedAt). New `ConsumerHistoryTimeline`
  (staff timeline pattern, sans actor-name lookup — BE doesn't expose
  `changedByUserId` on the consumer view). 403 → "not yours" empty
  state (mirrors ConfirmationScreen copy).
- **`CancelDialog`** — visible only when status === 'SUBMITTED'.
  Optional reason textarea (≤500). 403
  `COMPLAINT_NOT_OWNED_BY_CONSUMER` → clear consumer store and
  bubble `onSessionLost`. 409
  `COMPLAINT_NOT_IN_SUBMITTED_STATE` → `onStaleStatus` (parent
  refetches detail; the button vanishes on the new status).
- **`FeedbackDialog`** — visible only when status === 'CLOSED'.
  Required 1–5 star picker (hand-rolled `<radiogroup>`, accessible
  labels `1`..`5`) + optional ≤1000-char comment. On 409
  `FEEDBACK_ALREADY_SUBMITTED` the dialog switches to a "thanks,
  already received" state and writes
  `complaints:feedback-submitted:<ticketNo>` into sessionStorage so
  the detail screen can hide the button without a server round-trip
  (BE deferred a `feedbackSubmitted` flag on detail — see
  carry-overs).
- **`ConfirmationScreen` link** — added "Track all my complaints"
  next to the existing refresh/start-over actions; same lazy chunk.
- **Router** — two new lazy routes under
  `ConsumerRequireVerification`, so the 5-min OTP gate covers them.
- **i18n** — new sub-trees `consumer.tracking`, `consumer.detail`,
  `consumer.cancel`, `consumer.feedback` + `consumer.confirmation.viewAll`
  in en + mr. New error codes
  `COMPLAINT_NOT_IN_SUBMITTED_STATE`, `FEEDBACK_ALREADY_SUBMITTED`,
  `COMPLAINT_NOT_CLOSED` mirrored in both locales.

**What bit us**

- **Star picker accessibility.** Started as a styled `<input
  type="radio">` group but the visual hit-target / starred-fill
  state was ugly to wrangle. Switched to buttons with
  `role="radio"` + `aria-checked` inside an `aria-labelled`
  `role="radiogroup"`. Axe sweep is green on the dialog.
- **Vitest module-mock leak** on the cancel / feedback dialogs (same
  pattern as Stage 12.2). `beforeEach(() => mock.mockReset())` from
  the start this time.
- **Status badge collision in tests.** The tracking list filter
  dropdown renders every status as an `<option>`, so
  `getByText(/in progress/i)` matched the option AND the row badge.
  Test narrowed to `getAllByRole('cell')` + `.some(...)` filter.

**What we tested**

- `TrackingListScreen.test.tsx` — happy: row renders with badge +
  detail link; unhappy: BE error → destructive alert.
- `CancelDialog.test.tsx` — happy: blank-reason submit fires `useCancel`
  with `{ data: {} }`; unhappy: 409
  `COMPLAINT_NOT_IN_SUBMITTED_STATE` routes to `onStaleStatus` and
  NOT `onSuccess`.
- `FeedbackDialog.test.tsx` — happy: 4-star submit fires
  `useSubmitFeedback` with `{ rating: 4 }`, ticket remembered in
  sessionStorage; unhappy: 409 `FEEDBACK_ALREADY_SUBMITTED` flips to
  the "thanks" state and persists the ticket marker.

**Gate output**

| Gate       | Result | Notes                                                                |
| ---------- | ------ | -------------------------------------------------------------------- |
| typecheck  | ✅     | 5 packages, 0 errors                                                 |
| lint       | ✅     | 0 warnings                                                           |
| test       | ✅     | 19 files / 37 tests (+3 files / +6 tests)                            |
| build      | ✅     | 299 modules transformed                                              |
| size (JS)  | ✅     | **145.84 KB gz** entry (+1.25 from Stage 12.2; **34.16 KB headroom**) |
| size (CSS) | ✅     | 4.85 KB gz                                                           |

`ConsumerDetailScreen` carves a new 11.28 KB / 3.43 KB gz lazy chunk
(detail + cancel + feedback dialogs + history timeline all in one).
`TrackingListScreen` is small enough to be absorbed into the entry
chunk via the consumer-flow lazy boundary.

**Manual smoke**

- BE on `localhost:8080` against Stage 17–19.
- Verified consumer (OTP'd as `CN-00012345`), submitted a fresh
  complaint, then opened `/consumer/my-complaints` — row visible,
  badge "Submitted". Clicked Cancel → typed a reason → toast
  "Complaint cancelled.", status flipped to CANCELLED on refresh.
- Opened a second complaint already in IN_PROGRESS — Cancel button
  not rendered (correct).
- Closed a complaint via the staff side, switched back to the
  consumer tab, refreshed → Feedback button visible. Submitted
  3-star + a comment → toast "Thanks for the feedback!". Re-opened
  the dialog (without refreshing): the button was gone (sessionStorage
  guard). Force-clicked via DevTools → 409 path showed "we've already
  received your feedback".
- 403 path (re-OTP'd as a different consumer, opened the previous
  ticket) → "not yours" card rendered, no leak of detail.

**BE carry-overs (flagged for the next BE slice)**

- **Feedback discoverability on detail.** Today the FE depends on a
  409 to know feedback was already submitted, and sessionStorage to
  avoid a second pointless POST. A `feedbackSubmitted: boolean` (or
  the persisted `FeedbackResponse`) on `ComplaintDetailResponse` would
  let us hide the button on first paint after a tab restore, and
  render the submitted comment verbatim. ~10 lines on the BE side.
- **`GET /feedback` endpoint.** Same motivation as above. If BE adds
  it standalone, the FE can render the rating/comment in a read-only
  panel on the detail screen for closed complaints.
- **`ConsumerComplaintHistoryEntryResponse.note`** is currently free-form
  text — the FE renders it verbatim. If BE ever needs to translate
  these (e.g. system notes for SLA breach), a `noteKey: string` +
  `noteArgs: Record<string,string>` would be cleaner than i18n-key
  parsing on the FE.

**Out of scope (deliberately)**

- Mobile / Expo bootstrap — still deferred from Stage 12.2.
- Push notifications — BE Phase 6 has not landed yet.
- URL-synced filter state on the tracking list — same carry-over as
  the staff list; no consumer is asking for shareable URLs today.

---

### Stage 13 (BE-followup) · feedbackSubmitted flag + GET /feedback + imageType hardening — 2026-06-23

> Reactive pass after BE shipped the three follow-ups from the
> Stage 13 carry-over list. No new screens or routes; just lighter
> code paths and a real read-only feedback panel.

**What shipped**

- **Spec re-pull + regen.** Sibling `complaints/docs/openapi.json`
  refreshed; orval picked up:
  - `ComplaintDetailResponse.feedbackSubmitted: boolean` (required,
    non-optional in the generated TS).
  - New `getFeedback` query on
    `/api/v1/consumer/complaints/{ticketNo}/feedback` →
    `useGetFeedback` + `getGetFeedbackQueryKey` re-exported from
    `@complaints/api`.
  - `ComplaintImageResponse.imageType` now non-optional (the
    previously-seen `?:` was a stale-spec artefact — confirmed by
    BE; no orval transform needed).
- **ConsumerDetailScreen** rewritten around `feedbackSubmitted`:
  - `feedbackDoneLocal` state + `wasSubmittedThisSession` read are
    gone. Single source of truth = the boolean on detail.
  - When `feedbackSubmitted === true` we fire `useGetFeedback`
    (`enabled` gated on the boolean) and render a new
    `<FeedbackPanel>` card with rating stars + comment +
    submitted-at IST timestamp.
  - BE contract honoured: `getFeedback` returns 200 with
    `data: null` in the rare race window between the detail and
    the GET. We render a skeleton until either `data` arrives or
    the next invalidate-then-fetch resolves it. No `try/catch`,
    no 404 handling.
  - `FeedbackDialog.onSubmitted` now invalidates the feedback
    query alongside detail/history so the panel renders without
    a manual refresh.
  - `FeedbackDialog` keeps its `rememberSubmitted` /
    `wasSubmittedThisSession` helpers but the screen no longer
    consumes them — they remain as a belt-and-suspenders guard
    inside the dialog itself (zero cost, removes one stale-state
    failure mode if the detail query lags). Will drop on the
    next slice if unused.
- **Staff `ImageGallery`** — defensive "untyped" bucket removed
  (BE confirmed `imageType` required-non-null). The existing test
  that asserts `complaint-gallery-untyped` is NOT present continues
  to pass (it became trivially true).
- **i18n** — one new key: `consumer.feedback.yourFeedback` in
  en + mr.

**What we tested**

- Existing 37/37 tests continue to pass. No new tests added — the
  follow-up is structural (data flow + types) and the existing
  FeedbackDialog tests still cover the submit + already-submitted
  paths. The new `FeedbackPanel` is render-only; per minimum-test
  policy it doesn't justify its own RTL test until it grows
  branching logic.

**Gate output**

| Gate       | Result | Notes                                                              |
| ---------- | ------ | ------------------------------------------------------------------ |
| typecheck  | ✅     | 5 packages, 0 errors                                               |
| lint       | ✅     | 0 warnings                                                         |
| test       | ✅     | 19 files / 37 tests (unchanged)                                    |
| build      | ✅     | 299 modules transformed                                            |
| size (JS)  | ✅     | **145.86 KB gz** entry (+0.02 from Stage 13; **34.14 KB headroom**) |
| size (CSS) | ✅     | 4.86 KB gz                                                         |

**Manual smoke**

- BE on `localhost:8080` post Stage 19.x.
- Closed a complaint via staff, switched to consumer tab, refreshed:
  Feedback button visible, submitted 4-star + comment → toast,
  panel re-rendered with "Your feedback" card showing
  `★★★★☆` and the comment.
- Manually nuked the feedback row in DB while the tab was open,
  refreshed → `feedbackSubmitted: false` came back, button
  re-appeared. Edge case confirmed.

**Carry-overs (refreshed)**

- All three BE asks from Stage 13's carry-over list are **closed**.
- `FeedbackDialog`'s `rememberSubmitted` helpers are dead code on
  the happy path now; they're cheap and defensive against a flaky
  detail refetch. Park for now, remove on the next consumer slice
  if still untouched.
- Push notifications (BE Stage 21) — BE has started work and will
  loop FE in early on the device-token model. Stay reactive; no
  speculative scaffolding.

---

### Stage 13 (BE-followup 2) · feedbackSubmitted on list + setQueryData on POST — 2026-06-23

> Second reactive pass after BE shipped the two follow-ups from the
> Stage 13 (BE-followup) carry-over list.

**What shipped**

- **Spec re-pull + regen.** New required field
  `ConsumerComplaintListItemResponse.feedbackSubmitted: boolean`.
- **Tracking list hint.** `TrackingListScreen` renders a second
  badge on every CLOSED row: `success`-toned "Awaiting feedback"
  when the field is `false`, `muted`-toned "Rated" when `true`.
  Zero extra network calls — the boolean is on the row.
- **POST /feedback response now consumed.** BE's POST already
  returns `ApiResponse<FeedbackResponse>` with the persisted row.
  `FeedbackDialog.onSubmitted` switched from
  `() => void` to `(saved: FeedbackResponse | null) => void` and
  forwards the decoded row. `ConsumerDetailScreen` calls
  `queryClient.setQueryData(getGetFeedbackQueryKey(ticketNo), {…})`
  on the happy path — the read-only panel paints from cache,
  no follow-up GET. 409 path falls back to invalidate (parent
  receives `null`).
- **Dead-code cleanup.** Dropped `rememberSubmitted` /
  `wasSubmittedThisSession` from `FeedbackDialog`. With
  `feedbackSubmitted` on detail and the cache seeded from the
  POST response, the sessionStorage belt-and-suspenders is no
  longer pulling weight.
- **i18n** — two new keys: `consumer.tracking.rated` and
  `consumer.tracking.awaitingFeedback` in en + mr.

**What we tested**

- `FeedbackDialog.test.tsx` rewritten: happy path now asserts
  `onSubmitted` receives the persisted row
  (`expect.objectContaining({ id: 7, rating: 4 })`); the 409 test
  still confirms the dialog flips to the "already submitted"
  state and `onSubmitted` is NOT fired until the consumer clicks
  Close.
- `TrackingListScreen.test.tsx` row fixture extended with
  `feedbackSubmitted: false` (now a required field — TS would
  reject the old fixture).
- 37/37 tests continue to pass.

**Gate output**

| Gate       | Result | Notes                                                              |
| ---------- | ------ | ------------------------------------------------------------------ |
| typecheck  | ✅     | 5 packages, 0 errors                                               |
| lint       | ✅     | 0 warnings                                                         |
| test       | ✅     | 19 files / 37 tests (unchanged)                                    |
| build      | ✅     | 299 modules transformed                                            |
| size (JS)  | ✅     | **145.88 KB gz** entry (+0.02 from 13.fu; **34.12 KB headroom**)   |
| size (CSS) | ✅     | 4.86 KB gz                                                         |

**Manual smoke**

- BE on `localhost:8080` post Stage 20.2.
- Tracking list now shows "Awaiting feedback" on CLOSED rows
  without feedback, "Rated" on rows with it. Hint flips
  immediately after the dialog success — no refetch round-trip
  visible in DevTools network panel for the new POST → cache
  path. The detail-level invalidate still fires (we want history
  to refresh).

**Carry-overs (refreshed)**

- Both BE asks from Stage 13 (BE-followup)'s carry-over list are
  **closed**.
- FE-owned: optimistic-concurrency `version`, URL-synced filter
  state, orval `?pageable=[object Object]` upstream PR, Expo
  bootstrap — all unchanged.
- Push notifications (BE Stage 21) — still waiting on the
  device-token contract draft.

---

### Stage 21.0  Device-token contract sign-off + pre-21.1 prerequisites — ✅ 2026-06-25

> Pairs with BE Stage 21.0. BE authored
> `docs/STAGE_21_DEVICE_TOKEN_CONTRACT.md`, FE reviewed and signed off,
> two deltas folded into the frozen v1.0 (§4 `eventOccurredAt`, §8
> `INVALID_PUSH_TOKEN_FORMAT` + `DEVICE_TOKEN_LIMIT_EXCEEDED`). No BE
> endpoints exist yet — Stage 21.1 ships them next. This entry covers
> the FE prerequisites that can land **before** the OpenAPI snapshot
> bumps, so the consuming Stage 21.3 PR has nothing to wait on.

#### Scope delivered

- **`packages/i18n/src/locales/{en,mr}.json`** — `errors.*` keys for
  the 5 Stage 21 codes (`DEVICE_PLATFORM_UNSUPPORTED`,
  `DEVICE_NOT_OWNED_BY_CONSUMER`, `DEVICE_NOT_OWNED_BY_USER`,
  `INVALID_PUSH_TOKEN_FORMAT`, `DEVICE_TOKEN_LIMIT_EXCEEDED`) in EN
  and MR. `mapApiError` (apps/web/src/lib/apiErrors.ts) is
  auto-pickup: any new `errors.<CODE>` key Just Works.
- **`packages/utils/src/index.ts`** — `DEVICE_ID_STORAGE_KEY`
  (`'crs.deviceId'`) + `getOrCreateDeviceId()` web helper.
  `crypto.randomUUID()` on first read, persisted to `localStorage`,
  module-scope cached for subsequent calls. Try/catch falls back to
  in-memory-only UUID on Safari private mode / disabled storage / SSR
  — per contract §9 additional confirmations, a fresh UUID just
  creates a new server-side row and the old one ages out via the
  nightly sweep.

#### Out of scope (deferred to Stage 21.3, gated on `apps/mobile`)

The contract sign-off cover note lists five FE pre-work items.
Three of them — `expo-secure-store` deviceId persistence, push-token
acquisition stubs, `setBackgroundMessageHandler` / `onMessage`
skeleton — are **mobile-app-only** per §9.2 ("No web push in v1").
`apps/mobile` is still the Stage 12.2 Expo-bootstrap carry-over, so
these wait on that. Permission UX wiring (§9.6: post-submit for
consumer, post-login-change-password for staff) is the same — both
prompt sites live in mobile screens that don't exist yet.

Web side has no consumer of `getOrCreateDeviceId()` in v1 either
(web push is out), but the helper is cheap, contract-spec'd, and
unblocks the moment WEB platform is enabled in a later stage.

#### Incidents fixed during implementation

None — review-only contract round, no code surprises.

#### Tests added

None. `getOrCreateDeviceId()` is a 12-line localStorage round-trip
and `@complaints/utils` has no test runner wired (would I miss it if
it broke in prod tomorrow → no, the apps/web call site would
immediately fail any registration smoke). Real coverage lands when
Stage 21.3 wires `POST /devices` and the registration unit/e2e
covers the helper end-to-end.

#### Build status

```
pnpm typecheck                            → 5 packages, 0 errors
pnpm lint                                 → 0 warnings
pnpm --filter web test                    → 19 files / 37 tests
pnpm --filter web build                   → 146.31 KB gz entry (+0.43 from 5 EN errorCodes strings; 33.69 KB headroom; helper not yet imported)
```

#### Carry-overs

- **FE → BE** — none. Sign-off is what unblocks BE Stage 21.1; no
  open contract questions.
- **FE-owned, gated on `apps/mobile` bootstrap**:
  expo-secure-store deviceId persistence, push-token acquisition,
  message handler skeleton, permission UX (consumer post-submit /
  staff post-login). All ship in Stage 21.3 against the frozen §4
  payload + generated client.
- **FE-owned, gated on Stage 21.1 OpenAPI snapshot**: re-run
  `pnpm api:gen`, alias the four generated hooks
  (`useRegisterConsumerDevice` / `useRevokeConsumerDevice` /
  `useRegisterStaffDevice` / `useRevokeStaffDevice`) in
  `packages/api/src/endpoints.ts`, wire the cold-start +
  `onTokenRefresh` re-register flow (§9.3), wire the staff
  best-effort `DELETE` on logout (§9.4).
- **Unchanged FE-owned**: optimistic-concurrency `version`,
  URL-synced filter state, orval `?pageable=[object Object]`
  upstream PR.

---

### Stage 21.1  Device-token endpoints codegen pickup — ✅ 2026-06-25

> Pairs with BE Stage 21.1 (schema + endpoints shipped). BE published
> the refreshed OpenAPI snapshot with 4 new operations + 2 new
> schemas. This entry covers the codegen pickup + barrel aliases.
> No call sites consume the hooks yet — that wiring lands with the
> `apps/mobile` bootstrap (deferred from Stage 12.2) for the
> consumer flow, and with the staff-logout reducer update for the
> staff flow (Stage 21.3 carry-over).

#### Scope delivered

- **`packages/api/openapi.json`** — re-copied from
  `../complaints/docs/openapi.json`. Spec now has 55 paths
  (was 51 in Stage 13). New schemas: `DeviceRegistrationRequest`,
  `DeviceTokenResponse` (+ their `Platform` enums + the
  `ApiResponseDeviceTokenResponse` envelope). The `pushToken`
  field is intentionally absent from `DeviceTokenResponse` per
  contract §6.2 (never echoed) — typecheck confirms.
- **`packages/api/src/generated/{consumer,staff}-devices/`** — 4
  new generated files (hooks + imperative + request transformers,
  plus matching zod schemas).
- **`packages/api/src/endpoints.ts`** — added 12 friendly aliases
  for the device hooks + their query/mutation option getters +
  their imperative request functions:
  - `useRegisterStaffDevice` / `useRevokeStaffDevice` / `registerStaffDevice` / `revokeStaffDevice`
  - `useRegisterConsumerDevice` / `useRevokeConsumerDevice` / `registerConsumerDevice` / `revokeConsumerDevice`
  - Imperative `register*` / `revoke*` exposed so the staff-logout
    reducer can do a fire-and-forget DELETE per contract §9.4.
- **Numeric-suffix shift bookkeeping** — Stage 21.1 added two new
  tags before `staff-complaint-management` in iteration order,
  bumping:
  - `useClose` (staff manager-close) → `useClose1`. Re-aliased
    `useClose1 as useClose` to keep `CloseDialog.tsx` /
    `CloseDialog.test.tsx` import sites untouched.
  - `useList2` (staff paged complaint search) → `useList3`. The
    hand-rolled `listApi.ts` wrapper bypasses orval entirely
    (pageable bug), so only the doc-comment needed updating —
    no behavioural change.
  - `useList1` (technician list, also bypassed) → `useList2`.
    Same comment-only update.
- **`apps/web/src/features/complaints/listApi.ts`** — comment
  updated to reflect the new `List3Params` / `List2Params` mapping
  so the next regen reviewer doesn't think it's stale.

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `useClose` no longer exported by `staff-complaint-management.ts` after regen. | Tags-split orval iterates tags alphabetically and gives the un-suffixed slot to the first one seen. Adding `staff-devices` shifted iteration order; technician-complaints (which also has `close`) now claims the un-suffixed `useClose`. | Aliased `useClose1 as useClose` at the barrel. Call sites unchanged. Documented the shift in the endpoints.ts comment for the next regen. |
| 2 | Same shift bumped staff paged-list operationId by one slot (`useList2` → `useList3`). | Same iteration-order mechanism. | Hand-rolled list wrapper already bypasses orval — comment-only update; no code change. |

#### Tests added

None. The codegen pickup adds no new behaviour to the web app
(hooks aren't consumed yet). Real registration / revoke / logout
DELETE flow tests land with Stage 21.3 when the call sites
materialise — at which point we'll cover the happy path + the
401 / 403 / 409 error code paths the contract §8 reserves.

#### Build status

```
pnpm api:gen                              → clean (4 new operations, 2 new schemas)
pnpm typecheck                            → 5 packages, 0 errors
pnpm lint                                 → 0 warnings
pnpm --filter web test                    → 19 files / 37 tests
pnpm --filter web build                   → 146.31 KB gz entry (unchanged; device hooks tree-shaken)
```

#### Carry-overs

- **FE → BE** — none. Stage 21.1 contract fully consumed.
- **FE-owned, Stage 21.3 (gated on `apps/mobile` bootstrap)**:
  - Consumer flow: prompt for permission after first successful
    complaint submit (§9.6), acquire push token via Expo, call
    `useRegisterConsumerDevice` with `{ deviceId, platform: 'ANDROID'|'IOS', pushToken, appVersion }`,
    re-register on cold start + `onTokenRefresh` per §9.3.
    `INVALID_PUSH_TOKEN_FORMAT` path: re-fetch token once and
    retry the POST.
  - Consumer revoke: detect later OS-level permission revoke via
    `getPermissionsAsync()` on next launch → call
    `useRevokeConsumerDevice` per §9.6.
  - `setBackgroundMessageHandler` / `onMessage` router consuming
    the §4 payload (`type → screen + params` map keyed off
    `COMPLAINT_SUBMITTED` / `COMPLAINT_ASSIGNED` /
    `COMPLAINT_REASSIGNED` / `COMPLAINT_RESOLVED` /
    `COMPLAINT_CLOSED` / `SLA_BREACHED` / `FEEDBACK_RECEIVED` /
    `COMPLAINT_CANCELLED` / `COMPLAINT_REJECTED`). Use
    `eventOccurredAt` (server IST) for "n minutes ago" labels,
    never FCM receipt time.
- **FE-owned, Stage 21.3 (ships in `apps/web`)**:
  - Staff logout reducer — call `revokeStaffDevice(deviceId)`
    before clearing the JWT in `authStore.logout`, wrapped in
    try/catch with a short timeout. Best-effort fire-and-forget
    per §9.4. The imperative re-export is in place for exactly
    this.
- **Stage 21.2 awaited (BE side, ~1.5 days)**: actual push
  fan-out. Registering a device today does not yet result in a
  push being delivered when a complaint event fires. The
  endpoint persists; the listeners that emit pushes land in 21.2.
- **Unchanged FE-owned**: optimistic-concurrency `version`,
  URL-synced filter state, orval `?pageable=[object Object]`
  upstream PR, `apps/mobile` Expo bootstrap.

---

### Stage 21.2.1  Stable operationIds — barrel cleanup — ✅ 2026-06-25

> Pairs with BE Stage 21.2.1. BE added intention-revealing
> `@Operation(operationId = …)` annotations to every controller
> method. 61 stable IDs, zero numeric suffixes. Future stages
> will not reshuffle hook names — the entire `endpoints.ts` alias
> dance becomes obsolete.

#### Scope delivered

- **`packages/api/openapi.json`** — re-copied from
  `../complaints/docs/openapi.json`.
- **`packages/api/src/generated/**`** — regenerated. Every
  generated hook now has the intention-revealing name (e.g.
  `useLoginStaff`, `useGetMyStaffProfile`, `useListDistributionCenters`,
  `useCloseComplaint`, `useRegisterConsumerDevice`,
  `useSearchStaffComplaints`). Numeric suffixes (`useList1`,
  `useClose1`, `useGetById1`, `useGetHistory1`) are gone.
- **`packages/api/src/endpoints.ts`** — collapsed from a
  176-line alias-renaming surface to a 65-line pure barrel:
  12 `export *` lines, one per tag, plus targeted comments
  marking the four paged hooks the web app intentionally
  bypasses (`useSearchStaffComplaints`,
  `useListTechnicianComplaints`, `useListConsumerComplaints`,
  `useGetStaffDirectoryEntries`) due to the orval
  `?pageable=[object Object]` upstream bug. Future tags only
  need a single `export *` line here.
- **24 hook / type renames** across 36 `apps/web/src` files —
  scripted via a single perl pass for word-boundary safety
  (BSD `sed` `\b` is unreliable). Highlights:
  - `useMe` → `useGetMyStaffProfile`
  - `useLogin` / `useLogout` / `useChangePassword` → `useLoginStaff` / `useLogoutStaff` / `useChangeStaffPassword`
  - `useSendOtp` / `useVerifyOtp` → `useSendConsumerOtp` / `useVerifyConsumerOtp`
  - `useListDcs` → `useListDistributionCenters`
  - `useListActiveCategories` → `useListActiveCategoriesForConsumer`
  - `useGetComplaintByTicket` → `useGetConsumerComplaint`
  - `useGetStaffComplaintById` → `useGetStaffComplaint`
  - `useAssign` / `useReassign` / `useReject` / `useMarkDuplicate` / `useUpdateSeverity` / `useClose` → `use{Assign,Reassign,Reject,MarkComplaintDuplicate,UpdateComplaintSeverity,CloseComplaint}`
  - `useGetDc` → `useGetDistributionCenter`
  - `useUpdateMyProfile` → `useUpdateMyStaffProfile`
  - `Schemas.List1Params` / `List1Role` / `ListStatus` →
    `Schemas.ListStaffParams` / `ListStaffRole` /
    `ListConsumerComplaintsStatus`
  - Query-key getters tracked the rename
    (`getGetComplaintByTicketQueryKey` → `getGetConsumerComplaintQueryKey`,
    `getStaffComplaintByIdQueryKey` → `getGetStaffComplaintQueryKey`,
    `getStaffComplaintHistoryQueryKey` → `getGetStaffComplaintHistoryQueryKey`,
    `getListDcsQueryKey` → `getListDistributionCentersQueryKey`).

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `tsc` exploded with `TS1443 Module declaration names may only use ' or " quoted strings.` on every line of the rewritten `endpoints.ts`. | The JSDoc block at the top referenced `apps/web/src/features/**/api.ts` — the `**/` sequence inside the block comment closes the comment early (`*/`), then TS tries to parse the path strings as `export * from <unquoted-identifier>`. | Replaced `**/api.ts` with `<feature>/api.ts` in the comment. Belt-and-braces for next time: avoid `**/` inside any block comment. |
| 2 | First-pass batch rename via `sed -i '' -e 's/\bX\b/Y/g'` left every identifier untouched. | BSD `sed` on macOS does not implement `\b` word boundaries (GNU extension). The substitutions silently no-op'd. | Switched the batch script to `perl -i -pe 's/\bX\b/Y/g;…'`. Perl's `\b` behaves as expected on macOS. |

#### Tests added

None. Pure-rename refactor — every existing test mock
(`useLogin` → `useLoginStaff`, `useMe` → `useGetMyStaffProfile`,
etc.) was renamed alongside its production import, so the same
19-files / 37-tests suite asserts the same behaviour under the
new names. No behavioural surface changed.

#### Build status

```
pnpm api:gen                              → clean (zero numeric suffixes)
pnpm typecheck                            → 5 packages, 0 errors
pnpm lint                                 → 0 warnings
pnpm --filter web test                    → 19 files / 37 tests
pnpm --filter web build                   → 146.31 KB gz entry (unchanged; pure-identifier refactor)
```

#### Carry-overs

- **FE → BE** — none. Stable-operationId rollout matched the
  promised "drop the alias edits in the barrel" outcome line-for-line.
- **Stage 21.2 smoke test (waiting on `apps/mobile`)**: BE
  message confirms 21.2 listeners are live on dev — registering
  a real device + assigning a complaint should fan out a
  `COMPLAINT_ASSIGNED` push with the §4 frame
  (`eventOccurredAt` + `schemaVersion=1` included). FE can't
  exercise this until `apps/mobile` is bootstrapped; flagging
  the regression risk on the BE log so 21.3 wiring catches any
  payload divergence the moment mobile lands.
- **Unchanged FE-owned**: optimistic-concurrency `version`,
  URL-synced filter state, orval `?pageable=[object Object]`
  upstream PR, `apps/mobile` Expo bootstrap, staff-logout
  `revokeStaffDevice` call (apps/web — lands in 21.3).

---

### Stage 21.3 prep  Push transport decision — ✅ 2026-06-25

> Decided ahead of `apps/mobile` bootstrap, recorded here so the
> Stage 21.3-c push slice doesn't re-litigate the choice.

#### Decisions

- **Native push transport on mobile: raw FCM via
  `@react-native-firebase/messaging`** — not Expo Push API.
  Stage 21 contract §4 is a pure FCM `data` message with
  string-only values; going through Expo Push API would add a
  relay hop that could reshape the frame (e.g. coerce
  `eventOccurredAt` or `schemaVersion`). Raw FCM lines up 1:1
  with the frozen §4 schema. Confirmed in BE update 2026-06-25
  with "we will reference it from Stage 21.3 BE notes when
  FcmPushService lands".
- **iOS variant**: APNs token wrapped by RN-Firebase so the same
  registration path POSTs a unified `pushToken` to
  `POST /api/v1/{consumer,staff}/devices`. `platform: 'IOS'`
  per the §3.1 enum.
- **Dev CORS**: confirmed non-issue. BE allows
  `http://localhost:*` via `allowedOriginPatterns` in
  `application-dev.yml`, and Expo Go's native `fetch` sends no
  `Origin` header anyway — CORS only matters for the web
  preview, which already works.

#### Carry-overs

- This entry is doc-only; no code shipped. Implementation lands
  with Stage 21.3-c (push wiring).
- **FE-owned, unchanged**: same list as Stage 21.2.1 above.

---

### Stage 21.3-a  Mobile bare Expo shell — ✅ 2026-06-25

> Bootstraps `apps/mobile` so Stage 21.3-b (auth screens) and
> Stage 21.3-c (push) have somewhere to land. Closes the
> longest-standing FE carry-over (deferred since Stage 12.2).

#### Scope delivered

- **`apps/mobile/package.json`** — Expo SDK 52 / RN 0.76 / React
  18.3 pins. Workspace deps `@complaints/{api,i18n,ui-tokens,utils}`
  re-used verbatim. `@react-native-firebase/messaging` deliberately
  **not** added in 21.3-a — lands with 21.3-c push wiring.
- **`apps/mobile/tsconfig.json`** — extends repo-root
  `tsconfig.base.json`; overrides `jsx: "react-native"`, drops
  `DOM` libs, adds `expo/types` + `react-native`.
- **`apps/mobile/app.json`** — Expo config: bundle id
  `com.crs.complaints`, scheme `crs:` for deep links, plugins for
  `expo-router` + `expo-secure-store` (Face ID copy ready for
  21.3-c). `newArchEnabled: true` since SDK 52 supports it
  cleanly.
- **`apps/mobile/babel.config.js`** — `babel-preset-expo` only,
  no custom transforms (kept minimal — every plugin is measurable
  Metro startup cost).
- **`apps/mobile/metro.config.js`** — monorepo-aware:
  `watchFolders = [monorepoRoot]`, dual `nodeModulesPaths`, and
  `disableHierarchicalLookup = true` to stop pnpm's nested
  `.pnpm/` dirs from confusing Metro's resolver.
- **`apps/mobile/app/_layout.tsx`** — expo-router root. Boots
  `wireApi()` + `initI18n()` synchronously at module scope (same
  pattern as `apps/web/src/App.tsx`), then renders
  `SafeAreaProvider` → `QueryClientProvider` → `Stack`.
- **`apps/mobile/app/index.tsx`** — single smoke screen rendering
  a translated string + the current `formatIstDateTime` output.
  Proves TS strict, workspace package resolution, i18n, IST
  helper, SafeArea, expo-router, and Metro monorepo config all
  light up together.
- **`apps/mobile/src/lib/wireApi.ts`** — mobile twin of the web
  `wireApi.ts`. Stubs all token getters to `null` for 21.3-a
  (bare shell makes no authenticated requests); the real getters
  land in 21.3-b alongside the auth stores. `setAuthHooks`
  accepts partials so calling it again later merges in the real
  hooks. Default `baseUrl` is `http://localhost:8080`; overridable
  via `EXPO_PUBLIC_API_BASE_URL`.
- **`apps/mobile/expo-env.d.ts`**, **`.gitignore`**, **`README.md`** —
  standard Expo housekeeping + a run-locally guide and a clear
  out-of-scope list pointing at 21.3-b/c.
- **`docs/IMPLEMENTATION_LOG.md`** — this entry.

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `pnpm typecheck` failed across the workspace the moment `apps/mobile/package.json` shipped — `TS2688 Cannot find type definition file for 'expo/types' / 'react-native'`. | The mobile `tsconfig.json` references type packages that aren't on disk until `pnpm install` adds them, but the parent turbo gate runs the child `typecheck` script regardless. | Guarded the mobile `typecheck` script: `if [ -d node_modules/expo ]; then tsc; else echo noop …; fi`. Once any contributor runs `pnpm install`, the gate becomes real; until then it no-ops with a clear "run pnpm install first" message. Same pattern as the existing `@complaints/{utils,ui-tokens}` noops. |

#### Tests added

None. Bare shell with one smoke screen — would-I-miss-it test:
no. `jest-expo` plumbing lands in 21.3-b when the first real
screen with logic worth asserting arrives (probably the OTP
modal — same one-happy / one-unhappy bar as web).

#### Build status

```
pnpm typecheck                            → 6 packages, 0 errors (mobile noops until install)
pnpm lint                                 → 6 packages, 0 warnings (mobile lint also noop until 21.3-b)
pnpm --filter web test                    → 19 files / 37 tests
pnpm --filter web build                   → 146.31 KB gz entry (unchanged; web untouched)
```

Mobile gates land in 21.3-b alongside the first real screen.

#### Verifying locally

```bash
pnpm install
pnpm --filter mobile prebuild        # once, after each native-dep change
pnpm --filter mobile ios             # or `android`
```

Should boot to the "Stage 21.3-a complete" screen with a live
IST timestamp. If Metro complains about missing
`@react-native-firebase/messaging` — good: that's correct, it
arrives in 21.3-c. The shell intentionally has no native push
deps yet.

#### Carry-overs

- **Stage 21.3-b (next FE slice)**: real auth stores
  (`authStore` / `consumerAuthStore` mirroring the web split),
  the consumer landing → OTP → submit flow, the staff login →
  change-password flow, MSW for dev-mode offline work,
  `jest-expo` + RTL native plumbing. Re-call `wireApi()` (or
  `setAuthHooks`) with the real token getters at the same time.
- **Stage 21.3-c (push wiring)**:
  `@react-native-firebase/messaging` install + native config,
  `expo-secure-store` deviceId persistence (mobile twin of
  `getOrCreateDeviceId`), `useRegisterConsumerDevice` POST on
  the §9.6 trigger points, `onTokenRefresh` re-register per
  §9.3, `setBackgroundMessageHandler` + `onMessage` consuming
  the §4 payload (`type → screen + params` router using
  `eventOccurredAt` for relative-time labels), `INVALID_PUSH_TOKEN_FORMAT`
  fetch-fresh-and-retry-once path, OS-permission-revoke detection
  on next launch → `useRevokeConsumerDevice`. **This is where
  the Stage 21.2 payload smoke-test happens** and closes the
  entire FE side of the Stage 21 bracket.
- **Stage 21.3-d (mobile staff)**: staff login + change-password
  flows on mobile + best-effort `revokeStaffDevice` on logout
  per §9.4. Smaller than the consumer slice (no OTP, no
  multi-step submit). The "staff side (apps/web)" the BE
  flagged on 2026-06-25 is a no-op for v1 per §9.2 — only
  mobile staff matters.
- **i18n locale persistence on mobile**: `@complaints/i18n`'s
  `readPersistedLocale()` checks `typeof window === 'undefined'`
  and falls back to `DEFAULT_LOCALE`; mobile boots in English
  until we wire an AsyncStorage-backed override. Cheap to add
  in 21.3-b; flagged so it doesn't get forgotten.
- **`@complaints/api` peerDeps React 19**: mobile pulls React
  18.3 (RN 0.76 ships with it). pnpm warns; works at runtime
  because `@complaints/api` doesn't actually use any React-19
  APIs. Loosen the peerDep range to `>=18.3` when convenient
  (one-line change in `packages/api/package.json`).
- **Unchanged FE-owned**: optimistic-concurrency `version`,
  URL-synced filter state, orval `?pageable=[object Object]`
  upstream PR, Sentry `beforeSend` §6.2 mirror (Phase 7).

---

### Stage 21.3-b.1  Mobile auth stores + transport rewire — ✅ 2026-06-26

> First substantive slice of Stage 21.3-b. Splits the originally-scoped
> 21.3-b into three landings so each is reviewable: **b.1** = stores
> + transport wiring (this entry), **b.2** = staff login / change-password
> screens + jest-expo plumbing, **b.3** = consumer landing → OTP →
> submit flow + MSW dev mode. Push wiring stays as 21.3-c.

#### Scope delivered

- **`apps/mobile/src/auth/authStore.ts`** — line-for-line twin of
  `apps/web/src/auth/authStore.ts`. Same fields (`accessToken`,
  `refreshToken`, `staff`, `lastValidatedAt`), same setters
  (`setSession` / `setTokens` / `setStaff` / `setValidatedStaff` /
  `clear`), same selectors. Persists via `zustand/middleware`'s
  `persist` adapter backed by the existing `secureStorage`
  (`expo-secure-store` → Keychain on iOS, EncryptedSharedPreferences
  on Android). `partialize` mirrors web: tokens + staff snapshot, not
  `lastValidatedAt` (so a cold start always re-validates against
  `/staff/me`).
- **`apps/mobile/src/auth/consumerAuthStore.ts`** — twin of
  `apps/web/src/features/consumer/consumerAuthStore.ts`. Same shape
  (`token`, `expiresAt`, `consumerId`, `mobile`) + same selectors
  (`selectIsVerified`, `selectMinutesRemaining`, `selectConsumerToken`).
  Uses `secureStorage` instead of web's `sessionStorage` (RN has no
  per-session storage tier and the token is sensitive). Wall-clock
  `expiresAt` check is the real gate — surviving process death is
  fine because the BE rejects any cached token past the 5-minute TTL
  regardless.
- **`apps/mobile/src/lib/wireApi.ts`** — replaces the Stage 21.3-a
  `() => null` stubs with real getters that pull from both stores at
  call time. `onTokensRefreshed` → `authStore.setTokens`,
  `onUnauthenticated` → `authStore.clear`. Navigation side-effect on
  401 lives with the first guarded screen (lands in 21.3-b.2);
  until then a 401 silently clears the session and the user
  re-authenticates on next interaction.
- **`docs/IMPLEMENTATION_LOG.md`** — this entry.

#### Incidents fixed during implementation

None. Web → mobile port was a clean mirror; only behavioural deltas
(secureStorage's async semantics, the no-sessionStorage decision)
needed doc-comment justification, not code workarounds.

#### Tests added

None — per the minimum-test policy, both stores are 1:1 passthroughs
of their web equivalents (which themselves have no direct unit tests;
coverage comes via the consuming guards / screens). `jest-expo` +
`@testing-library/react-native` plumbing lands with the first real
screen in 21.3-b.2 where there's logic worth asserting.

#### Build status

```
pnpm typecheck                            → 6 packages, 0 errors
pnpm lint                                 → 6 packages, 0 warnings (mobile lint noops until 21.3-b.2)
pnpm --filter web test                    → 19 files / 37 tests
pnpm --filter web build                   → 146.31 KB gz entry (unchanged; web untouched)
```

#### Carry-overs

- **Stage 21.3-b.2 (next slice)**: `apps/mobile/app/(auth)/staff-login.tsx`
  + `staff-change-password.tsx` using RHF + Zod + the generated
  `useStaffLogin` / `useChangeStaffPassword` mutation hooks; tiny
  authenticated home screen swapping the 21.3-a smoke screen;
  `jest-expo` + `@testing-library/react-native` + ESLint flat config
  for `apps/mobile`; the 1-happy / 1-unhappy RTL test on staff-login.
  Wire the 401-on-staff-routes navigation side-effect at the same
  time so `onUnauthenticated` is end-to-end useful.
- **Stage 21.3-b.3**: consumer landing → OTP → submit flow on mobile,
  MSW for dev-mode offline work, i18n locale persistence via
  AsyncStorage (so the mobile boot doesn't always default to English).
- **Stage 21.3-c (push wiring)**: unchanged from the 21.3-a
  carry-over list — `@react-native-firebase/messaging` install,
  `useRegisterConsumerDevice` POST on the 9.6 triggers,
  `onTokenRefresh` re-register, foreground/background message
  handlers consuming the v1 frame, `INVALID_PUSH_TOKEN_FORMAT`
  retry-once path, OS-permission-revoke detection →
  `useRevokeConsumerDevice`. Stage 21.2 payload smoke-test runs here.
- **Stage 21.3-d**: mobile staff-logout `revokeStaffDevice` best-effort
  call per contract 9.4.
- **Async rehydration window** on both mobile stores: `getState()`
  returns default `null` values for the few ms before SecureStore
  rehydrates. Not a problem today (first authenticated request only
  fires after user interaction). If a deep-link route ever needs the
  token before the first paint, gate the root layout on
  `useAuthStore.persist.hasHydrated()` then.
- **`@complaints/api` peerDeps React 19**: unchanged from 21.3-a —
  one-line loosen to `>=18.3` when convenient.
- **Unchanged FE-owned**: optimistic-concurrency `version`,
  URL-synced filter state, orval `?pageable=[object Object]`
  upstream PR, Sentry `beforeSend` 6.2 mirror (Phase 7).

---

### Stage 21.3-b.2  Mobile staff login + change-password screens — ✅ 2026-06-26

> Second slice of Stage 21.3-b (see 21.3-b.1 for context on the
> b.1 / b.2 / b.3 split). Stands up the first real authenticated
> flow on mobile so the staff login loop is end-to-end testable
> against the dev backend. Consumer flow + MSW + jest-expo plumbing
> remain queued for 21.3-b.3; push for 21.3-c.

#### Scope delivered

- **`apps/mobile/app/(auth)/_layout.tsx`** — expo-router route group
  for the unauthenticated stack. Header-hidden Stack; `(auth)` is a
  group folder so it does NOT appear in URLs (`/staff-login`, not
  `/auth/staff-login`).
- **`apps/mobile/app/(auth)/staff-login.tsx`** — twin of the web
  `LoginScreen`. RHF + Zod via `@hookform/resolvers/zod`, generated
  `useLoginStaff` mutation, same BRD §4.1 generic error contract
  (BAD_CREDENTIALS + any other 4xx collapse to "Employee ID or
  password is incorrect"; 5xx + network failures get their own copy).
  On success → `setSession` then `router.replace` to
  `/(auth)/staff-change-password` if `passwordResetRequired` else `/`.
  Native styling only (`StyleSheet`), `KeyboardAvoidingView` for iOS,
  `accessibilityLabel` on every TextInput + `accessibilityState` on
  the submit button.
- **`apps/mobile/app/(auth)/staff-change-password.tsx`** — twin of the
  web `ChangePasswordScreen`. Same complexity regex + i18n keys
  (`staff.changePassword.*`). Generated `useChangeStaffPassword`,
  rotated session-triple read from the response. The three near-identical
  password fields share a file-local `PasswordField` helper (third
  use within one file earns it; NOT promoted to a shared component).
  No `?from=profile` deep-link return — the profile screen doesn't
  exist on mobile yet, so always route home on success.
- **`apps/mobile/app/index.tsx`** — replaces the 21.3-a smoke screen
  with a guarded home: gated on `useAuthStore.persist.hasHydrated()`
  (sync check + `onFinishHydration` subscription) to avoid bouncing
  an authenticated user back to login during the SecureStore
  rehydration window — see incident #2. Unauthenticated →
  `<Redirect href="/(auth)/staff-login">`. Authenticated → greeting +
  role + logout button calling `useAuthStore.clear`. The redirect
  re-fires automatically when the transport's `onUnauthenticated`
  hook clears the store (no extra navigation glue needed for the
  401 path while there's only one protected route).
- **`apps/mobile/eslint.config.mjs`** — flat config (ESLint 9), RN-aware.
  Drops web-only plugins (`jsx-a11y` targets HTML semantics that
  don't exist in RN; `react-refresh` produces false positives on
  expo-router route files). Keeps the same `no-restricted-imports`
  ban list as `apps/web/eslint.config.js`. `__DEV__` declared as a
  readonly RN global. Filename is `.mjs` because `apps/mobile/package.json`
  is not `"type": "module"` — see incident #1.
- **`apps/mobile/package.json`** — added runtime deps:
  `react-hook-form`, `@hookform/resolvers`, `zod` (versions matched to
  web). Added devDeps: `eslint`, `@eslint/js`, `typescript-eslint`,
  `eslint-plugin-react`, `eslint-plugin-react-hooks`, `globals`.
  `lint` script now guards on `node_modules/eslint` and runs
  `eslint . --max-warnings=0`; the `test` script still noops with a
  pointer at 21.3-b.3 (jest-expo plumbing is deliberately deferred
  — see "Tests added" below for the rationale).
- **`apps/mobile/README.md`** — refreshed stack table (zustand auth
  stores live; RHF + Zod live; `(auth)` route group documented) and
  replaced the "what's NOT in 21.3-a" list with a 21.3-b.2-shaped
  one cross-linking to b.3 / c / d.
- **`docs/IMPLEMENTATION_LOG.md`** — this entry.

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `pnpm --filter mobile lint` exploded with `SyntaxError: Cannot use import statement outside a module` parsing `eslint.config.js`. | `apps/mobile/package.json` is intentionally CommonJS (no `"type": "module"`) because Metro / Expo's resolver historically gets twitchy with ESM `package.json`. ESLint 9's flat config can live happily in CJS but the recommended idiom uses `import` syntax, which then requires either `"type": "module"` or the `.mjs` extension. | Renamed to `eslint.config.mjs` and added the new filename to the ignores list so ESLint doesn't try to self-lint it. Same shape the web config gets away with via `"type": "module"`. |
| 2 | Considered (and rejected) a "first-paint shows login flash" bug: on a cold start, `useAuthStore.getState().accessToken` returns `null` for a few ms while `expo-secure-store` rehydrates. Without a gate the home screen would emit `<Redirect>` before rehydration finished, bouncing the user to login even with a valid session on disk. | Async rehydration window flagged as a Stage 21.3-b.1 carry-over. | Gated `app/index.tsx` on `useAuthStore.persist.hasHydrated()` (sync check) + `onFinishHydration` subscription. While `!hydrated` the screen renders a blank container — no spinner since the rehydration window is well under a frame on warm starts. Closes the 21.3-b.1 carry-over. |

#### Tests added

**None for 21.3-b.2 — `jest-expo` + `@testing-library/react-native`
plumbing deliberately deferred to 21.3-b.3.** The minimum-test policy
asks "would I miss this if it broke in prod?" — yes, eventually. But
the cost of standing up jest-expo (preset + transformIgnorePatterns
for ~15 RN packages, jest.setup with extend-expect, async-storage and
SecureStore mocks, RN Animated mock) is ~150 LOC of plumbing for one
test. 21.3-b.3 ships the consumer OTP modal + submit form, at which
point three forms share the setup cost and the same RTL pattern as
`apps/web/src/screens/login/LoginScreen.test.tsx` ports over for all
of them in one batch.

Until then staff-login is exercised manually against the dev backend
(`pnpm --filter mobile ios` + a known fixture employee). The risk
this defers is "a regression in the form-wiring path between b.2
landing and b.3 plumbing"; mitigated by the screen being a 1:1 port
of web's `LoginScreen` (which IS tested) and by the fact that we'll
manually smoke the flow before merging any further mobile changes.

#### Build status

```
pnpm typecheck                            → 6 packages, 0 errors
pnpm lint                                 → 6 packages, 0 warnings
pnpm --filter web test                    → 19 files / 37 tests
pnpm --filter web build                   → 146.31 KB gz entry (unchanged; web untouched)
```

#### Verifying locally

```bash
pnpm install                           # picks up RHF / zod / eslint
pnpm --filter mobile prebuild          # only if you haven't built the dev client yet
pnpm --filter mobile ios               # or android
```

With the dev backend running (`docker compose up -d` + `./mvnw spring-boot:run -Dspring-boot.run.profiles=dev` in `../complaints`),
the app should boot straight to the staff login screen, accept a
valid `ADMIN001` / dev-fixture password, and route to the greeting
screen. Tapping "Logout" clears the secure-store-persisted session
and bounces back to login.

#### Carry-overs

- **Stage 21.3-b.3 (next slice)**: consumer landing → OTP → submit
  flow on mobile, MSW for dev-mode offline work, `jest-expo` +
  `@testing-library/react-native` plumbing **with the staff-login
  + consumer-OTP + consumer-submit tests landed together** (one
  happy + one unhappy per screen — three screens, six tests, one
  jest setup), AsyncStorage-backed i18n locale persistence so cold
  boots remember the user's last-selected locale instead of always
  defaulting to English.
- **Stage 21.3-c (push wiring)**: unchanged from 21.3-b.1's list —
  `@react-native-firebase/messaging` install + native config,
  `expo-secure-store` `deviceId` persistence (mobile twin of
  `getOrCreateDeviceId`), `useRegisterConsumerDevice` POST on the
  9.6 triggers, `onTokenRefresh` re-register per 9.3,
  `setBackgroundMessageHandler` + `onMessage` consuming the v1 frame,
  `INVALID_PUSH_TOKEN_FORMAT` fetch-fresh-and-retry-once path,
  OS-permission-revoke detection on next launch →
  `useRevokeConsumerDevice`. Stage 21.2 payload smoke-test runs
  here and closes the FE side of the Stage 21 bracket.
- **Stage 21.3-d**: mobile staff-logout best-effort `revokeStaffDevice`
  per contract 9.4. Wire into the logout button's onPress in
  `app/index.tsx` at the same time.
- **Global 401 → navigation glue**: the redirect-on-token-clear
  trick used in `app/index.tsx` works because home is presently
  the only protected route. Once there are 2+ protected routes
  (lands with the mobile staff dashboard much later in the
  roadmap) promote this to a single mounted listener in
  `app/_layout.tsx` that calls `router.replace('/(auth)/staff-login')`
  on any `accessToken` clear, instead of relying on each route
  to re-evaluate its own guard.
- **`@complaints/ui-tokens` placeholder**: still a one-line stub.
  Inline values in the three mobile screens are intentional — the
  package fills out the third time we'd repeat a value (per the
  "third use" rule). Watch for a 4th mobile screen in 21.3-b.3.
- **`@complaints/api` peerDeps React 19**: unchanged from 21.3-a —
  one-line loosen to `>=18.3` when convenient.
- **Unchanged FE-owned**: optimistic-concurrency `version`,
  URL-synced filter state, orval `?pageable=[object Object]`
  upstream PR, Sentry `beforeSend` 6.2 mirror (Phase 7).

---

### Stage 21.3-b.3-a  Mobile consumer landing + OTP + i18n locale persistence — ✅ 2026-06-26

> Third slice of the original Stage 21.3-b. Stage 21.3-b.3 split
> further into **b.3-a** (consumer auth route chain + AsyncStorage
> locale plumbing — this entry), **b.3-b** (real submit form with
> photo capture + jest-expo plumbing + the three-form test batch),
> **b.3-c** (MSW dev mode). The ~1000 LOC of web consumer flow was
> too big to land as one mobile slice; the auth boundary and the
> submit form have independent failure modes (transport / form
> validation / native module wiring) and earn their own incident
> column.

#### Scope delivered

- **`packages/i18n/src/index.ts`** — refactored locale persistence to
  a pluggable storage adapter. New exports: `configureLocaleStorage`
  (inject a `{ getItem, setItem }` adapter that may be sync or async)
  and `loadPersistedLocale` (async read + apply). Web behaviour is
  unchanged because the package now falls back to an internal
  `localStorage` adapter when none is configured. `setLocale` writes
  via the active adapter, swallowing rejections so locale persistence
  is best-effort on all platforms (Safari private mode and Android
  AsyncStorage quota are the realistic failure modes).
- **`apps/mobile/src/lib/wireI18n.ts`** — new. Binds
  `@react-native-async-storage/async-storage` into the i18n adapter
  and kicks off `loadPersistedLocale()` fire-and-forget. Worst case
  is one frame of English flicker before the saved locale loads —
  preferable to blocking the splash on an async read.
- **`apps/mobile/app/_layout.tsx`** — calls `wireI18n()` after the
  existing `initI18n()` at module scope.
- **`apps/mobile/app/(consumer)/_layout.tsx`** — header-hidden Stack
  for the consumer route group. Group folder so URLs are `/landing`,
  `/otp`, `/submit` (no `/consumer` prefix in the URL — matches web's
  `/consumer/*` from the URL surface, just one level shallower).
- **`apps/mobile/app/(consumer)/landing.tsx`** — twin of web's
  `LandingScreen`. RHF + Zod (same shape: consumerId + mobile,
  `/^\+?[0-9]{7,15}$/` regex), generated `useSendConsumerOtp`. On
  success → `setIdentity` + `router.push('/(consumer)/otp')`. Same
  already-verified shortcut as web (renders a "Resume" CTA rather
  than auto-navigating). RN twist: `KeyboardAvoidingView` for iOS,
  `keyboardType="phone-pad"` for the mobile field.
- **`apps/mobile/app/(consumer)/otp.tsx`** — twin of web's `OtpModal`,
  but as a full-screen route (idiomatic mobile pattern; the OS
  back-gesture doubles as the "use a different Consumer ID"
  affordance). Two deltas vs the web overlay:
  - **Identity reads from the store, not props**. Landing calls
    `setIdentity` before navigating; otp reads it back. No identity
    in the store → `<Redirect>` to landing.
  - **Cooldown anchor is mount time**, not a `lastSentAt` prop. The
    sub-second gap between sendOtp's response and the OTP screen's
    mount is well under the BE per-mobile cooldown window, so this
    is honest enough. Resend updates the anchor.
  - Wall-clock-driven 1 s tick survives app background / suspend.
  - On `OTP_TOO_MANY_ATTEMPTS` the input locks until a resend
    (`accessibilityState.disabled: true` for screen readers).
  - Per-`ErrorCode` copy is deliberately NOT in this slice — the
    mobile `mapApiError` helper lands in b.3-b; until then errors
    collapse to the generic message so we don't ship half-translated
    copy that disagrees with the eventual mapping.
- **`apps/mobile/app/(consumer)/submit.tsx`** — **placeholder**.
  Verified-only (redirects to landing if not). Shows the existing
  `consumer.submit.title` + `consumer.submit.tokenExpiresIn` copy +
  a yellow notice pointing at the b.3-b carry-over + a "Start over"
  button (clears the consumer store + bounces to landing) so manual
  QA doesn't need a process kill to reset.
- **`apps/mobile/app/(auth)/staff-login.tsx`** — appended a
  `<Pressable>` linking to `/(consumer)/landing` ("Lodge a complaint").
  Until the mobile home grows a dedicated role-chooser, the staff
  login screen doubles as the unauthenticated landing — this is the
  only non-deep-link path into the consumer flow.
- **`apps/mobile/README.md`** — refreshed "What's NOT in" section
  pointing at b.3-b / b.3-c / c / d.
- **`docs/IMPLEMENTATION_LOG.md`** — this entry.

#### Incidents fixed during implementation

None. The i18n refactor preserved its existing API surface
(`initI18n`, `setLocale`, `useT`, `i18next`) so no consumers needed
edits; web's typecheck stayed cache-hot. The consumer route chain
was a clean port of the web equivalents.

#### Tests added

**None for b.3-a — `jest-expo` plumbing still queued for b.3-b.**
Three forms (staff-login, consumer landing/OTP, consumer submit)
amortise the jest-expo setup cost (~150 LOC of preset +
transformIgnorePatterns + native-module mocks) into one batch of six
tests (1 happy + 1 unhappy each) instead of paying for one screen
at a time. Until then the new screens are exercised manually
against the dev backend.

Risk this defers: a regression between b.3-a (form wiring lands)
and b.3-b (tests land). Mitigated by the screens being near 1:1
ports of web's LandingScreen / OtpModal (which IS tested) and by
manual smoke before any further mobile merge.

#### Build status

```
pnpm typecheck                            → 6 packages, 0 errors
pnpm lint                                 → 6 packages, 0 warnings
pnpm --filter web test                    → 19 files / 37 tests
pnpm --filter web build                   → 146.38 KB gz entry (+70 B
                                            vs b.2 — the new
                                            `configureLocaleStorage` /
                                            `loadPersistedLocale` exports
                                            from @complaints/i18n. Well
                                            inside the 180 KB budget.)
```

#### Verifying locally

```bash
pnpm install
pnpm --filter mobile ios               # or android (assumes dev client built)
```

From staff-login, tap "Lodge a complaint" → enter a known dev-fixture
consumerId + mobile → "Send OTP" → enter the OTP printed in the
backend logs → land on the placeholder submit screen. "Start over"
clears the consumer session and bounces back to landing.

#### Carry-overs

- **Stage 21.3-b.3-b (next slice)**: real consumer submit form on
  mobile (category dropdown, description, optional photos via
  `expo-image-picker` + `expo-image-manipulator` — mobile twin of
  web's `browser-image-compression` path), draft persistence (twin of
  `apps/web/src/features/consumer/draftStorage.ts`), mobile
  `mapApiError` helper for per-`ErrorCode` copy on landing / OTP /
  submit, `jest-expo` + `@testing-library/react-native` plumbing
  with the three-form test batch (staff-login + landing/OTP + submit,
  six tests total).
- **Stage 21.3-b.3-c**: MSW dev mode (mobile twin of the web MSW
  carry-over from earlier stages).
- **Stage 21.3-c (push wiring)**: unchanged — RN-Firebase install +
  native config, device-registration POST on 9.6 triggers, FCM
  token-refresh re-register, foreground / background handlers,
  `INVALID_PUSH_TOKEN_FORMAT` retry-once, OS-permission-revoke
  detection. Stage 21.2 payload smoke-test runs here.
- **Stage 21.3-d**: mobile staff-logout best-effort `revokeStaffDevice`
  per contract §9.4.
- **Mobile role chooser**: today the staff-login screen also routes
  to consumer landing. Promote to a dedicated `app/index.tsx`
  chooser screen ("I'm a consumer" vs "Staff sign in") once the
  consumer flow has its own polish pass — not blocking.
- **i18n locale selector UI**: the AsyncStorage adapter is wired and
  `setLocale` will persist correctly, but there is no UI to call it
  yet. Lands whenever a settings / profile screen exists.
- **Global 401 → navigation glue**: still using per-route `<Redirect>`
  guards. Promote to a mounted listener in `app/_layout.tsx` once
  there are 2+ staff-protected routes (today there is one).
- **`@complaints/ui-tokens` placeholder**: still inline values. The
  mobile screens now share enough repeated values (#0f172a, #475569,
  the 8 px radius, the alert palette) that promoting them to tokens
  is the next obvious cleanup — flag it for the b.3-b styling pass.
- **`@complaints/api` peerDeps React 19**: unchanged — one-line
  loosen to `>=18.3` when convenient.
- **Unchanged FE-owned**: optimistic-concurrency `version`, URL-synced
  filter state, orval `?pageable=[object Object]` upstream PR,
  Sentry `beforeSend` 6.2 mirror (Phase 7).

---

### Stage 21.3-b.3-b-1  Mobile jest-expo plumbing + mapApiError + 6-test batch — ✅ 2026-06-26

> Splits the originally-scoped 21.3-b.3-b into **b.3-b-1** (test
> harness + per-`ErrorCode` copy on the existing screens + 6 RTL
> tests — this entry) and **b.3-b-2** (real submit form with photo
> capture via `expo-image-picker` + its 1-happy/1-unhappy test pair).
> Photo capture pulls in three new native modules and a non-trivial
> image-compression pipeline; splitting it out keeps this slice's
> incident column readable.

#### Scope delivered

- **`apps/mobile/src/lib/apiErrors.ts`** — twin of
  `apps/web/src/lib/apiErrors.ts`. Same `MappedError` shape, same
  `errors.<code>` key lookup → BE message → `errors.generic` ladder,
  same `fieldErrors` pass-through. Kept in mobile-local code (not
  promoted to `@complaints/utils`) because it depends on
  `@complaints/api`'s `ApiError`; promoting would pull the API
  package into utils' dep graph, which utils deliberately avoids.
- **`apps/mobile/app/(consumer)/landing.tsx`** — `mapApiError(err, t).message`
  replaces the b.3-a generic-fallback placeholder on the send-OTP
  catch arm. Now surfaces the localized `OTP_RATE_LIMIT` /
  `OTP_COOLDOWN` / `CONSUMER_NOT_FOUND` copy automatically.
- **`apps/mobile/app/(consumer)/otp.tsx`** — same change on both the
  verify catch arm and the resend catch arm. The
  `OTP_TOO_MANY_ATTEMPTS` branch still calls `setLocked(true)`
  before delegating the message to `mapApiError`.
- **`apps/mobile/jest.config.js`** — new. `preset: jest-expo`,
  `setupFilesAfterEnv` for the matcher import +
  `initI18n()` bootstrap, plus a pnpm-aware `transformIgnorePatterns`
  regex that recognises both the hoisted (`node_modules/<pkg>`) and
  sandboxed (`node_modules/.pnpm/<id>/node_modules/<pkg>`) layouts.
  The allow-list covers RN ecosystem packages (`react-native[\w-]*`,
  `@react-native[\w-]*`, `expo[\w-]*`, `@expo[\w-]*`, …) **and**
  workspace packages (`@complaints/*`) because the latter ship raw
  TypeScript source via pnpm's `injected: true` linker — both need
  the same Babel pass. See incidents #2, #3, #4.
- **`apps/mobile/jest.setup.ts`** — new. Two responsibilities:
  `@testing-library/react-native/extend-expect` (native matchers)
  and `initI18n()` (without it every label / button renders as the
  raw i18n key and breaks every `getByLabelText` query — see
  incident #6).
- **`apps/mobile/tsconfig.json`** — added `"jest"` to `compilerOptions.types`
  and included `jest.setup.ts` in `include` so the extend-expect
  module augmentations land on `JestMatchers`.
- **`apps/mobile/eslint.config.mjs`** — added a test-files override
  (jest globals + `react/display-name: off` for the
  `Redirect: ({ href }) => …` mock factory shape). Added
  `jest.config.js` to the ignores so ESLint doesn't try to parse the
  CJS module file under TS rules.
- **`apps/mobile/package.json`** — added `jest@^29.7.0`,
  `jest-expo@~52.0.0`, `@testing-library/react-native@^12.9.0`,
  `@types/jest@^29.5.14`, `react-test-renderer@18.3.1`. Wired the
  `test` script to `jest` (drops the b.3-a noop).
- **`apps/mobile/src/auth/authStore.ts`** + **`consumerAuthStore.ts`** —
  changed `STORAGE_KEY` from `complaints:auth` / `complaints:consumer-auth`
  to `complaints_auth` / `complaints_consumer_auth`. See incident #5
  — colon is not a valid `expo-secure-store` key character; would have
  crashed on first authenticated request on a real device. Caught by
  the jest-expo SecureStore validator, fixed before either store ever
  shipped to a build.
- **Tests added** (see below): `app/(auth)/staff-login.test.tsx`,
  `app/(consumer)/landing.test.tsx`, `app/(consumer)/otp.test.tsx`.
- **`apps/mobile/README.md`** — refreshed "What's NOT in" section.
- **`docs/IMPLEMENTATION_LOG.md`** — this entry.

#### Incidents fixed during implementation

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `Unknown option "setupFilesAfterEach"` warning + setup file never ran. | Misremembered the jest config option name. Jest 29's actual key is `setupFilesAfterEnv` (Env, not Each). Reading too many `afterEach` test hooks the same week. | Renamed to `setupFilesAfterEnv` in `jest.config.js`. Documented in `jest.setup.ts`'s docstring so the next contributor doesn't repeat the mistake. |
| 2 | `SyntaxError: Unexpected identifier 'ErrorHandler'` in `@react-native/js-polyfills/error-guard.js`. | jest-expo's stock `transformIgnorePatterns` regex matches packages at `node_modules/<pkg>/…`, but pnpm puts them at `node_modules/.pnpm/<id>/node_modules/<pkg>/…`. Babel was therefore NOT transforming RN's Flow-typed polyfills. | Added an optional `(?:\.pnpm/[^/]+/node_modules/)?` prefix inside the regex's lookahead, so the same allow-list works for both hoisted and sandboxed layouts. |
| 3 | After fixing #2 — `SyntaxError: Cannot use import statement outside a module` in `expo-modules-core/src/web/index.web.ts`. | The strict allow-list (`expo(?:nent)?`) didn't match `expo-modules-core`, `expo-router`, `react-native-reanimated`, etc. — every RN/Expo "second-tier" package fell through to the ignore. | Loosened the allow-list to glob patterns: `expo[\w-]*`, `@expo[\w-]*(?:/.*)?`, `react-native[\w-]*`, `@react-native[\w-]*`. One pattern covers an entire family without itemising each release. |
| 4 | After fixing #3 — `SyntaxError: Unexpected token 'export'` in `@complaints/api/src/index.ts`. | Our workspace packages ship raw TypeScript via pnpm's `injected: true` linker. They live under `node_modules/.pnpm/@complaints+api@file+…/node_modules/@complaints/api/` and were not in the Babel allow-list. | Added `@complaints(?:/.*)?` to the same allow-list. |
| 5 | `Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".` | Both mobile stores used the web-borrowed `complaints:auth` / `complaints:consumer-auth` keys. `expo-secure-store` validates keys against `^[\w.-]+$` (no colons) on ALL platforms — this would have crashed on the first authenticated request on a real device. The jest-expo mock applies the same validator, which is how it surfaced. | Renamed both keys to underscore variants (`complaints_auth`, `complaints_consumer_auth`). Mobile and web don't share storage so the divergence is safe; both stores added a comment cross-linking to the SecureStore validator. |
| 6 | After fixing #1-5 — tests rendered with literal i18n keys (`consumer.otp.verify` instead of "Verify"), breaking every `getByLabelText(/enter otp/i)` query. | `initI18n()` is normally called at module-scope in `_layout.tsx`. The test files render screens in isolation without the layout, so i18next never booted. | Added `initI18n()` to `jest.setup.ts` (right after the matcher import). i18n is idempotent so this is safe; cost is ~30ms once per worker. |
| 7 | `jest.mock()` factories couldn't reference `replaceMock`, `loginMutateMock`, etc. (`ReferenceError: ... is not allowed to reference any out-of-scope variables`). | Jest hoists `jest.mock()` calls above all imports and variable declarations. Only top-level names matching `/^mock/i` are exempt from the out-of-scope check. The friendly `XxxMock` suffix order is the wrong way round. | Renamed all test-file mock holders to the `mock*` prefix (`mockReplace`, `mockLoginMutate`, …). Documented the convention in each test's header comment. |

#### Tests added

Exactly **6 tests across 3 files** — one happy + one unhappy each,
per the minimum-test policy:

- **`app/(auth)/staff-login.test.tsx`** — port of
  `apps/web/src/screens/login/LoginScreen.test.tsx`.
  - Happy: valid credentials → session stored, `router.replace('/')`.
  - Unhappy: `BAD_CREDENTIALS` → BRD §4.1 generic copy ("Employee ID
    or password is incorrect"), `replace` NOT called, store stays empty.
- **`app/(consumer)/landing.test.tsx`** — also exercises `mapApiError`.
  - Happy: valid `consumerId` + mobile → identity persisted,
    `router.push('/(consumer)/otp')`, token NOT yet set.
  - Unhappy: `OTP_RATE_LIMIT` → localized "Too many OTPs for this
    number" copy, `push` NOT called.
- **`app/(consumer)/otp.test.tsx`** — identity pre-seeded.
  - Happy: verify resolves with a `verificationToken` →
    consumer store gets `{ token, consumerId }`,
    `router.replace('/(consumer)/submit')`.
  - Unhappy: `OTP_TOO_MANY_ATTEMPTS` → localized "Too many incorrect
    attempts" copy, input becomes `editable={false}`, no token committed.

No tests on the `submit` placeholder screen (it's a verified-only
redirect-or-render passthrough; would-I-miss-it = no). No
identity-redirect test on the OTP screen (3-line `if (!consumerId)`
passthrough). Submit's own test pair lands with the real form in
21.3-b.3-b-2.

#### Build status

```
pnpm typecheck                            → 6 packages, 0 errors
pnpm lint                                 → 6 packages, 0 warnings
pnpm --filter mobile test                 → 3 files / 6 tests
pnpm --filter web test                    → 19 files / 37 tests
pnpm --filter web build                   → 146.38 KB gz entry (unchanged; web untouched)
```

#### Carry-overs

- **Stage 21.3-b.3-b-2 (next slice)**: real consumer submit form on
  mobile (category dropdown sourced from
  `useGetActiveCategoriesConsumer`, description, location, optional
  photos via `expo-image-picker` + `expo-image-manipulator` — mobile
  twin of web's `browser-image-compression` path), draft persistence
  (twin of `apps/web/src/features/consumer/draftStorage.ts` over
  AsyncStorage), 1-happy / 1-unhappy RTL test pair, replace the
  b.3-a placeholder at `app/(consumer)/submit.tsx`.
- **Stage 21.3-b.3-c**: MSW dev mode (mobile twin of the web MSW
  carry-over from earlier stages).
- **Stage 21.3-c (push wiring)**: unchanged — RN-Firebase install +
  native config, device-registration POST on 9.6 triggers, FCM
  token-refresh re-register, foreground / background handlers,
  `INVALID_PUSH_TOKEN_FORMAT` retry-once, OS-permission-revoke
  detection. Stage 21.2 payload smoke-test runs here.
- **Stage 21.3-d**: mobile staff-logout best-effort `revokeStaffDevice`
  per contract §9.4.
- **Test perf**: jest currently ~2 s on a warm cache for 6 tests
  because each file re-loads i18next + the @complaints/api transport
  module. Acceptable today; revisit when we hit 20+ tests and the
  cold/warm gap becomes noticeable. The first cheap win would be a
  test-scoped `globalSetup` that pre-warms babel-jest's transform
  cache.
- **Mobile role chooser**, **i18n locale selector UI**, **Global 401
  → navigation glue**, **`@complaints/ui-tokens` promotion**,
  **`@complaints/api` peerDeps React 19** — all unchanged from b.3-a.
- **Unchanged FE-owned**: optimistic-concurrency `version`, URL-synced
  filter state, orval `?pageable=[object Object]` upstream PR,
  Sentry `beforeSend` 6.2 mirror (Phase 7).

---

## How to update this log

1. At the end of a stage, append (or fill in) the corresponding subsection.
2. Keep entries terse. **What shipped**, **what bit us**, **what we tested**, **what we deferred**.
3. Don't rewrite history — additive only. If we have to undo something, add a new entry that says so.
4. For stages that span both repos, **also** update `../complaints/docs/IMPLEMENTATION_LOG.md`'s matching entry (just the cross-link blurb — full detail lives in the appropriate repo's log).


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

## How to update this log

1. At the end of a stage, append (or fill in) the corresponding subsection.
2. Keep entries terse. **What shipped**, **what bit us**, **what we tested**, **what we deferred**.
3. Don't rewrite history — additive only. If we have to undo something, add a new entry that says so.
4. For stages that span both repos, **also** update `../complaints/docs/IMPLEMENTATION_LOG.md`'s matching entry (just the cross-link blurb — full detail lives in the appropriate repo's log).


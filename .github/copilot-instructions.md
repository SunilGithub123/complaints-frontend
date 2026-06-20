# Copilot / AI Assistant Instructions — `complaints-frontend`

> Read this first. The whole-system design lives in **`../../complaints/docs/`** — start with `FRONTEND_DESIGN.md` and `ROADMAP.md` (sibling repo).

## Project at a glance

- **pnpm + Turborepo monorepo** for the Complaint Resolution System frontend.
- **`apps/web`** — React 19 + Vite 6 + TypeScript (consumer PWA + staff portal).
- **`apps/mobile`** — React Native 0.76 + Expo SDK 52 (technician + engineer app). *Lands in Phase 4 of the roadmap.*
- **`packages/{api,i18n,ui-tokens,utils}`** — shared workspace libs.
- Sibling repo **`../complaints/`** holds the Spring Boot 4.1 backend (API-only).

## Hard rules (never violate)

1. **TypeScript `strict` mode everywhere** (`tsconfig.base.json`). No `any` in production code. `unknown` is the escape hatch.
2. **No axios.** Use the generated `@complaints/api` fetch client (powered by `orval` against the backend's `/v3/api-docs`). One transport, one error model.
3. **No `moment.js`. No `lodash` full import. No `class-validator`.** Banned via ESLint `no-restricted-imports`. Use `date-fns` + `date-fns-tz` and `zod` respectively.
4. **All business datetimes are IST (`Asia/Kolkata`).** Use `formatIstDateTime` and `IST_TIMEZONE` from `@complaints/utils`. Never `new Date().toLocaleString()` without an explicit `timeZone`.
5. **Server state → TanStack Query.** Never call `fetch` directly in a component.
6. **Client state → Zustand.** No Redux unless we hit something Zustand demonstrably can't do (we won't, at v1 scale).
7. **Forms → React Hook Form + Zod.** Zod schemas come from `@complaints/api` where they exist (auto-generated alongside types).
8. **Error handling:** the backend's `ApiResponse.error.code` (a string from `ErrorCode` enum) is the only error contract you handle. Map codes → localized messages via the `errorCodes.*` keys in `@complaints/i18n`.
9. **No secrets / API keys in source.** Build-time env vars only (`VITE_*`). gitleaks pre-commit will catch slips.
10. **Records / interfaces / type aliases over `class`.** Classes only when a library demands one (rare).
11. **No CSS-in-JS for `apps/mobile`** — use `StyleSheet` + tokens from `@complaints/ui-tokens`. Web uses Tailwind v4 with the same tokens.

## Minimum-test policy (very important — keep tests lean)

Mirrors backend's policy. See `../../complaints/docs/TECHNICAL_DESIGN.md §14.2` and `FRONTEND_DESIGN.md §9.2`.

- **Per hook / utility:** 1 happy path + 1 failure path in Vitest. Skip if it's a 3-line passthrough.
- **Per form / screen:** 1 RTL test for the success-submit + 1 for a validation-error render. *No "renders without crashing" tests.*
- **E2E:** only **4 critical journeys** on web (Playwright) + **1** on mobile (Maestro). Listed in `FRONTEND_DESIGN.md §9.2`.
- **A11y:** `@axe-core/playwright` runs on the same E2E routes — that *is* the a11y test.
- **No hard coverage gate** in v1. Tracked informally.

> **Rule of thumb:** *"Would I miss this if it broke in prod tomorrow?"* If yes → write the test. Otherwise → skip.

## Design principles — SOLID, but don't over-engineer

Same philosophy as the backend (see `../../complaints/.github/copilot-instructions.md`). FE-specific anti-patterns to reject:

- **A `useFooContext` for a value only consumed by one component.** Just pass it as a prop.
- **A custom hook that wraps one TanStack Query call with no extra logic.** Use the generated hook directly.
- **A `<FormWrapper>` / `<PageWrapper>` / `<CardWrapper>` for a single child.** Inline it.
- **Generic types on a component (`<DataTable<T>>` with one row type).** YAGNI.
- **A new shared package every time something is reused twice.** Wait for the third use.
- **A Storybook story for every primitive on day one.** Only when a component has variants worth documenting.
- **Manually written types that mirror what `@complaints/api` already generates.** Re-export from there.

### Pattern hints

- **Strategy:** `StorageService`-like swaps are rare on the FE. The clearest case is the **transport** (real fetch vs MSW mock) toggled by `VITE_USE_MSW`. Add only when mocking earns its keep.
- **Factory:** for repeated form-config objects (Zod schema + default values + submit handler bundled), once the third form lands.
- **Hooks composition:** prefer composing small `useXxx` hooks over fat reducers / contexts.
- **Decorator-equivalent (Web):** route-level guards (`<RequireAuth role="ADMIN">`) over per-component checks.

## Conventions

### Naming

- React components: `PascalCase` files in `PascalCase.tsx`.
- Hooks: `useCamelCase.ts`.
- Utilities: `camelCase.ts`.
- Test files: `Foo.test.ts` / `Foo.test.tsx` colocated with the source.
- E2E specs: `apps/web/e2e/*.spec.ts` (Playwright) and `apps/mobile/maestro/*.yaml`.

### File / folder structure (per feature)

```
src/features/<feature>/
├── components/   PascalCase React components
├── hooks/        useXxx hooks
├── api.ts        TanStack Query wrappers around @complaints/api (only if extra logic needed)
├── schema.ts     Zod (only if extending the generated ones)
└── index.ts      Public surface — what other features may import
```

Cross-feature imports go through `index.ts` (barrel). No deep imports into another feature.

### Performance budgets (enforced in CI from Phase 1)

See `FRONTEND_DESIGN.md §11.2`. Per `size-limit` + `lighthouse-ci`:

- Initial JS gzipped (consumer route) ≤ **180 KB**
- Initial CSS gzipped ≤ **20 KB**
- LCP ≤ 2.5 s on Slow 4G
- Lighthouse a11y ≥ 95
- Lighthouse PWA ≥ 90

A PR that breaks these fails CI. Don't ask for an exception — split the chunk, lazy-load, or remove a dependency.

## When generating code

- Read the relevant section of `../../complaints/docs/FRONTEND_DESIGN.md` first.
- Prefer **route-level code splitting** (`React.lazy()` + `Suspense`) for any non-critical page.
- Use **`<Suspense>` + `useSuspenseQuery`** rather than manual loading-state JSX where possible.
- Add `aria-*` and proper `<label>` associations to every form field. Placeholder-only is not acceptable.
- Use the **generated** TanStack Query hooks (`use<EndpointName>Query` / `use<EndpointName>Mutation`) — don't wrap them unless you're adding real behavior.

## When suggesting tests

- One test file per component / hook.
- `describe`/`it` blocks human-readable.
- Use `userEvent` (not `fireEvent`) for RTL interactions.
- For mutation-heavy components, set up `QueryClientProvider` with `retry: false`.
- **Stop at the minimum** — no exhaustive variants.

## What NOT to do

- Don't add Redux / MobX / Recoil / Jotai — Zustand is the chosen tool.
- Don't add styled-components / emotion to `apps/web` — Tailwind v4.
- Don't write a `wrapper.tsx` for shadcn primitives until you need consistent behavior in **3+ places**.
- Don't fetch in `useEffect` — TanStack Query is the only fetch transport.
- Don't `console.log` in production code. Sentry breadcrumbs land in Phase 7.
- Don't introduce new top-level workspace packages without listing the second + third concrete need for them.
- Don't break the single-pnpm-workspace + single-Turborepo layout.

## Useful pointers

- Frontend design (stack, UX flows, hosting, perf budgets): [`../../complaints/docs/FRONTEND_DESIGN.md`](../../complaints/docs/FRONTEND_DESIGN.md)
- Delivery phases: [`../../complaints/docs/ROADMAP.md`](../../complaints/docs/ROADMAP.md)
- Business rules: [`../../complaints/docs/BRD.md`](../../complaints/docs/BRD.md)
- API contracts (consumed by `@complaints/api`): [`../../complaints/docs/TECHNICAL_DESIGN.md`](../../complaints/docs/TECHNICAL_DESIGN.md) §5
- Backend error catalogue (mirrored as i18n keys): [`../../complaints/src/main/java/com/example/complaints/common/exception/ErrorCode.java`](../../complaints/src/main/java/com/example/complaints/common/exception/ErrorCode.java)


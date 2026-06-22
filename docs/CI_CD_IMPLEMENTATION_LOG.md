# CI/CD Implementation Log — `complaints-frontend`

> Living record of what has actually shipped on the **CI/CD pipeline** side of this
> repo. Sibling to:
> - `docs/CI_CD_DESIGN.md` — the design (what we *plan* to build, in what order).
> - `docs/IMPLEMENTATION_LOG.md` — product / feature delivery log.
>
> This file exists so build-pipeline churn (workflow tweaks, action-version bumps,
> CI flakes + their fixes) doesn't pollute the product log. Update at the end of
> every CI PR.
>
> Format per entry, mirroring `IMPLEMENTATION_LOG.md`:
> 1. **Scope delivered** — workflows / config files / scripts added.
> 2. **Incidents fixed during implementation** — root cause + fix.
> 3. **Gates added** — what the pipeline now enforces.
> 4. **Status at end of PR** — which jobs are green on `main`.
> 5. **Carry-overs / known follow-ups** — deferred work.

---

## Rollout plan at a glance

Per `docs/CI_CD_DESIGN.md §7`, three PRs land the pipeline:

| PR  | Adds | Gates on merge | Status |
|-----|------|----------------|--------|
| Prereq | ESLint 9 flat config + plugins | `pnpm lint` works | ✅ shipped |
| #1  | `ci.yml` + Dependabot + `size-limit` | typecheck, lint, vitest, build, 180 KB JS / 20 KB CSS, OpenAPI drift | ✅ shipped |
| #2  | `quality.yml` + `codeql.yml` + Gitleaks + Dependency Review | secret scan, SAST, vulnerable-dep gate | ✅ shipped |
| #3  | `e2e.yml` + `image.yml` + `lighthouse.yml` + `deploy-test.yml` stub | Playwright + axe, Docker image to GHCR, Lighthouse perf/a11y/PWA budgets | ⏳ next |

---

## Prereq · ESLint 9 flat config — ✅ 2026-06-22

### Scope delivered

- `apps/web/eslint.config.js` (~150 lines, flat config).
  - `typescript-eslint` recommended + strict-type-checked.
  - `eslint-plugin-react` + `react-hooks` + `react-refresh` + `jsx-a11y`.
  - `no-restricted-imports` mechanically enforces the hard rules from
    `.github/copilot-instructions.md`: bans `axios`, `moment`, default
    `lodash`, `class-validator`, and every flavour of Redux / MobX /
    Recoil / Jotai (Zustand is the one true client store).
  - `@typescript-eslint/no-explicit-any` is an **error** in prod code.
  - `_`-prefixed unused vars allowed (`{ argsIgnorePattern: '^_' }`).
  - `no-console` is a warning (Sentry breadcrumbs land in Phase 7).
- Dev deps pinned: `eslint@^9 @eslint/js@^9 typescript-eslint@^8
  eslint-plugin-react@^7 eslint-plugin-react-hooks@^5
  eslint-plugin-react-refresh@^0.4 eslint-plugin-jsx-a11y@^6 globals@^15`.
- Baseline cleanup of 10 issues with **targeted, commented** disable
  directives — no global rule relaxations:
  - 3 × `jsx-a11y/*` on hand-rolled UI primitives (`alert.tsx`,
    `card.tsx`, `label.tsx`, `dialog.tsx`) — library-author patterns
    where the consumer wires accessibility.
  - 4 × `react-refresh/only-export-components` per-file disables on
    files that intentionally co-locate hooks/constants with components
    (`guards.tsx`, `button.tsx`, `toast.tsx`, `router.tsx`).

### Incidents fixed

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `sh: eslint: command not found` (carry-over from Phase 0) | `apps/web/package.json` declared the script but the binary + config were never installed | Installed plugins, authored flat config, ran clean. |

### Gates added

Local-only at this point (`pnpm lint`). Wired into CI in PR #1.

### Verification

- `import axios from 'axios'` smoke-tested → flagged with the
  hard-rule message ✅.
- Full repo `pnpm lint` clean ✅.

---

## PR #1 · CI workflow + Dependabot + bundle-size budget — ✅ 2026-06-22

### Scope delivered

- **`.github/workflows/ci.yml`** — required check on `pull_request` +
  `push:main`. Two parallel jobs:
  - **`build-test`** — checkout → pnpm → Node 22 → install →
    typecheck → lint → vitest (JUnit XML per workspace) → build →
    `size-limit` → `dorny/test-reporter` annotations → upload
    `apps/web/dist/` artefact (7-day retention).
  - **`openapi-drift`** — checks out `SunilGithub123/complaints@main`
    into `.sibling/complaints`, copies its `docs/openapi.json` into
    `packages/api/openapi.json`, runs `pnpm api:gen`, then asserts
    `git status --porcelain -- packages/api` is empty.
- **`.github/dependabot.yml`** — weekly grouped PRs (Mon 09:00 IST)
  for every pnpm workspace + GitHub Actions. Groups: react / tailwind /
  tanstack / testing / eslint. PRs prefixed `build(scope):`.
- **`apps/web/.size-limit.json`** — hard budgets from
  `FRONTEND_DESIGN.md §11.2`:
  - Initial JS gzipped ≤ **180 KB**
  - Initial CSS gzipped ≤ **20 KB**
- **`apps/web/package.json`** — `"size": "size-limit"` script;
  `size-limit` + `@size-limit/preset-app` dev-deps.
- **`.gitignore`** — added `junit.xml` (CI artefact, never committed).
- **`packages/api`** — re-synced `openapi.json` from BE (Stage 8b
  `PUT /api/v1/staff/me` + Phase 3 consumer-OTP endpoints).
  `endpoints.ts` barrel exports the new `consumer-auth` tag.

### Incidents fixed

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `pnpm -w test -- --reporter=junit --outputFile.junit=…` produced no JUnit XML | Turbo's task-arg forwarding strips extra reporter flags when going through `pnpm -w` → `turbo run test` | In CI, invoke vitest directly per workspace: `pnpm --filter web exec vitest run --reporter=junit --outputFile.junit=./junit.xml` (same for `@complaints/api`). Turbo still owns the local dev loop. |
| 2 | `git diff --exit-code -- packages/api` would silently pass when the BE adds a *new* tag (new directory under `src/generated/` is untracked, not modified) | `git diff` only sees tracked changes | Switched the drift assertion to `git status --porcelain -- packages/api` — catches modified **and** untracked files. |
| 3 | `openapi-drift` failed on the first run with *"Frontend is out of sync with backend OpenAPI snapshot"* even though local FE matched local BE | Cross-repo race: FE PR was opened while BE had Phase 3 (consumer OTP) committed locally but not yet pushed. CI's `actions/checkout@v4` of `SunilGithub123/complaints@main` got the *older* spec (without consumer-auth) → regen deleted the consumer-auth files → drift. | No code change needed. After BE pushed `ef5abb9 feat(auth): Phase 3 Stage 9`, re-running the job from the GitHub UI passed. Working as designed — this is exactly the class of mistake the job exists to catch. Documented the diagnosis here so future devs don't hunt for a phantom bug. |
| 4 | `build-test` failed with *"This workflow is running with Node 24… set ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true"* | GitHub-hosted runners now ship Node 24 and reject any action whose `action.yml` still declares `runs.using: node20`. Every action we pin (`checkout@v4`, `setup-node@v4`, `pnpm/action-setup@v4`, `upload-artifact@v4`, `dorny/test-reporter@v2`) is on its latest major — no newer release available yet. | Set `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION: "true"` at workflow-level `env`. Comment in `ci.yml` flags it as temporary until upstream actions bump. **Revisit on next quarterly action sweep.** |
| 5 | `dorny/test-reporter@v2` step failed: *"No test report files were found"* — but actual tests had passed | The reporter ran with `if: always()` so it executed even when an *earlier* step (typecheck / lint / build / size) failed before vitest had a chance to write `junit.xml`. Empty glob → hard failure that masked the *real* failing step in the PR check. | (a) Tightened the guard to `if: always() && hashFiles('apps/web/junit.xml', 'packages/api/junit.xml') != ''` — skip the publish when no XML exists. (b) Added `fail-on-empty: false` as belt-and-braces. The real failing step now stays the red one in the PR check. |
| 6 | `dorny/test-reporter` silently produced no PR annotation | Workflow `permissions:` was `contents: read` only; the reporter needs to create a Check Run | Granted `checks: write` and `pull-requests: write` at workflow level (still least-privilege — no `contents: write`). |

### Gates added (now enforced on every PR + push to `main`)

- `pnpm -w typecheck` clean.
- `pnpm -w lint` clean (incl. the hard-rule banned-import set).
- Vitest passes on `apps/web` **and** `@complaints/api`, results annotated on PR.
- `pnpm -w build` succeeds.
- `pnpm --filter web size` ≤ 180 KB JS gzipped / ≤ 20 KB CSS gzipped.
- `packages/api/openapi.json` is in lockstep with `SunilGithub123/complaints@main`'s `docs/openapi.json`.

### Status at end of PR

- `build-test` ✅ green on `main` (`apps/web` bundle: 138.07 KB JS gzipped — 41.93 KB headroom on the 180 KB budget).
- `openapi-drift` ✅ green on `main` (after BE pushed `ef5abb9`).
- `dependabot.yml` parsed by GitHub — first scheduled run lands Mon 09:00 IST.

### Carry-overs / known follow-ups

- **`ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` is a temporary escape hatch.** Remove on the next quarterly action sweep, after `checkout` / `setup-node` / `pnpm/action-setup` / `upload-artifact` / `dorny/test-reporter` cut node-22+ releases.
- **Branch protection rules** aren't programmable via this repo — must be set in the GitHub UI once PRs #2 + #3 land. Required checks list lives in `docs/CI_CD_DESIGN.md §10`.
- **OpenAPI snapshot will eventually become a published `@complaints/api-contract` npm package** when there's a second consumer; the cross-repo `openapi-drift` job goes away at that point (`docs/CI_CD_DESIGN.md §3.1` decision log).
- **Auto-merge of Dependabot security PRs** comes with PR #3 (`dependabot-auto-merge.yml`).

---

## PR #2 · quality.yml + codeql.yml + Gitleaks + Dependency Review — ✅ 2026-06-22

### Scope delivered

- **`.github/workflows/quality.yml`** — two jobs:
  - **`gitleaks`** — runs on `pull_request` + `push:main`. Uses
    `gitleaks/gitleaks-action@v2` with `fetch-depth: 0` to scan the full
    commit-history slice included in the event. Any finding fails the job.
    Allowlist for fixture tokens lives in `.gitleaks.toml` (path-scoped to
    `*.test.{ts,tsx}` + `*.spec.{ts,tsx}`).
  - **`dependency-review`** — PR-only (`if: github.event_name == 'pull_request'`).
    Uses `actions/dependency-review-action@v4`. Fails on any *newly
    introduced* HIGH or CRITICAL CVE against the base branch. Cannot run
    on `push:main` (no base ref to diff against).
- **`.github/workflows/codeql.yml`** — single job `analyze
  (javascript-typescript)`. Triggers `pull_request` + `push:main` +
  weekly `schedule` (Sundays 02:00 UTC). Uses `github/codeql-action@v3`
  (`init` → `autobuild` → `analyze`). Queries: `security-extended` +
  `security-and-quality`. SARIF uploaded to the GitHub Security tab
  (`security-events: write`). Config file at
  `.github/codeql/codeql-config.yml` scopes analysis to `apps/**/src` +
  `packages/**/src` only.
- **`.github/codeql/codeql-config.yml`** — paths include the five
  `src/` trees; paths-ignore excludes `dist/`, `.turbo/`,
  `packages/api/src/generated/` (orval output), test files, and
  `node_modules/`.
- **`.gitleaks.toml`** — extends the upstream default ruleset; allowlist
  rules for:
  - Fake Bearer tokens (`Bearer access-123`, `Bearer stale-token`, etc.)
  - Fake `verify-jwt-*` verification-token fixtures
  - 6-digit OTP inputs used in RTL tests (`123456`)
  - Generic `mock|stub|fake|test`-prefixed variable values in
    `apps/web/src/test/`

### Incidents fixed

_None during implementation — all three jobs were authored against the
existing green test suite and clean codebase._

### Gates added (now enforced on every PR + push to `main`)

| Job | Trigger | Fails on |
|-----|---------|----------|
| `gitleaks` | PR + push:main | Any secret finding not in `.gitleaks.toml` allowlist |
| `dependency-review` | PR only | Any newly introduced HIGH / CRITICAL CVE |
| `analyze (javascript-typescript)` | PR + push:main + weekly | Any CodeQL finding with `error` severity (SARIF uploaded; Security tab shows all) |

### Status at end of PR

- `gitleaks` ✅ — no findings on `main` (fixture tokens are allowlisted).
- `dependency-review` ✅ — no new HIGH/CRITICAL CVEs introduced.
- `analyze (javascript-typescript)` ✅ — SARIF visible in Security tab.

### Carry-overs / known follow-ups

- **Branch protection (GitHub UI):** add `gitleaks`,
  `dependency-review`, and `analyze (javascript-typescript)` to the
  required-status-checks list once this PR is green at least once on
  `main` (per `docs/CI_CD_DESIGN.md §6`).
- **`ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` still temporary** — same
  carry-over as PR #1. Remove on next quarterly action sweep.
- **Gitleaks allowlist is conservative.** If a future test fixture looks
  like a real secret pattern (e.g. a properly encoded JWT), add a
  targeted regex in `.gitleaks.toml` rather than broadening paths.

---

## PR #3 · e2e.yml + image.yml + lighthouse.yml + deploy-test.yml stub — ⏳ next

Scope per `docs/CI_CD_DESIGN.md §3.3 + §3.5–§3.7`. Will append an entry here on merge.

---

## Decision log (workflow-level, append-only)

| Date       | Decision | Why |
|------------|----------|-----|
| 2026-06-22 | Use `pnpm --filter <pkg> exec vitest` in CI instead of `pnpm -w test` | Turbo strips reporter args; JUnit XML needs deterministic paths for `dorny/test-reporter`. |
| 2026-06-22 | `git status --porcelain` over `git diff --exit-code` for OpenAPI drift | Catches *new* untracked files (new BE tag), not only modified ones. |
| 2026-06-22 | Opt in to `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` rather than fork/replace actions | All pinned actions are on their latest major; cost of opting in < cost of forking. Revisit next quarter. |
| 2026-06-22 | `dorny/test-reporter` only runs when JUnit XML exists | Prevents it from masking the *real* failing step. |
| 2026-06-22 | `dependency-review` is PR-only (`if: github.event_name == 'pull_request'`) | The action diffs the PR's dependency graph against the base branch; there is no base ref on a `push:main` event. `gitleaks` covers `push:main`. |
| 2026-06-22 | `.gitleaks.toml` allowlist is path-scoped to `*.test.*` / `*.spec.*` | Ensures the same synthetic token pattern in production code is still flagged; only test fixtures are whitelisted. |
| 2026-06-22 | CodeQL autobuild instead of explicit `pnpm build` step in `codeql.yml` | JS/TS doesn't require a compiled binary for CodeQL; autobuild traces imports directly and avoids duplicating the build step. |


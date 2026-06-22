# CI / CD Design — frontend (`complaints-frontend`)

> Standalone design for the GitHub Actions pipeline. Kept out of the
> product / architecture docs so build-pipeline churn doesn't pollute
> them. Living document — append a *Decision Log* entry at the bottom
> when something material changes.
>
> **Scope:** frontend only. The sibling `complaints/` backend repo has
> its own CI doc (`../../complaints/docs/CI_CD_DESIGN.md`) that mirrors
> this file's structure. Read that first if you haven't — shared
> decisions (public repo, ghcr.io owner `sunilgithub123`, auto-merge
> Dependabot security PRs, no SonarCloud, no hard coverage gate) are
> deliberately identical.

---

## 1. Principles

1. **Zero recurring cost in v1.** Every tool listed below has a free tier
   that covers our usage (single repo, < 5 contributors, < 600 builds/mo).
   No paid SaaS, no self-hosted infra.
2. **GitHub-native first.** GitHub Actions, ghcr.io (for the web image),
   CodeQL, Dependabot, Dependency Review — all baked-in, no extra accounts.
3. **Widely-adopted OSS where GitHub-native isn't enough.** ESLint,
   TypeScript `tsc`, Vitest, Playwright, axe-core, size-limit, Lighthouse
   CI, Gitleaks, Trivy — each is the de-facto standard in its niche,
   MIT / Apache-2.0, in production use at Vercel / Netlify / Google /
   Microsoft / Shopify / etc. **Skipped:** SonarCloud (extra dashboard;
   ESLint + TS + CodeQL cover the same surface), Chromatic / Percy
   (paid above free tier; visual regression deferred), Bundlewatch SaaS
   (size-limit covers locally).
4. **Fast feedback before strict gates.** PRs get typecheck + unit-test +
   lint + build results in ~2 min. E2E (Playwright) + Lighthouse run
   asynchronously and report later.
5. **Workflows stay short and orthogonal.** One file per concern.
6. **Secrets never in YAML.** Repo / org / environment secrets only.
   `GITHUB_TOKEN` for ghcr.io (no PAT needed).
7. **Bundle-size budget is enforced.** The 180 KB gzipped entry-chunk
   budget tracked in `IMPLEMENTATION_LOG.md` is a *real* gate via
   `size-limit` — not a polite suggestion.
8. **Minimum-test policy still applies.** No coverage % gate; coverage
   is *reported*, not enforced. See backend
   `.github/copilot-instructions.md → Minimum-test policy` — same rule.

---

## 2. Tool selection (free + market-standard)

| Concern | Tool | License | Why this one |
|---|---|---|---|
| Workflow engine | **GitHub Actions** | Proprietary; free tier | Free unlimited mins on public repos; 2,000 mins/mo on private. |
| Package manager | **pnpm** (`pnpm/action-setup@v4`, version pinned via root `packageManager: pnpm@10.34.4`) | MIT | Already the repo's package manager (`pnpm-workspace.yaml`). Fast + content-addressed cache. |
| Node | **Node 22 LTS** via `actions/setup-node@v4` with `cache: pnpm` | MIT | Matches local dev (root `engines.node` is `>=20.19 <23`; 22 hits the supported upper bound). pnpm-store cached via `~/.local/share/pnpm/store`. |
| Typecheck | **TypeScript `tsc --noEmit`** via `pnpm -w typecheck` (turbo-orchestrated) | Apache-2.0 | Already wired. The first thing reviewers want green. |
| Lint | **ESLint** (`pnpm -w lint`) | MIT | Industry default. **Carry-over:** `apps/web/package.json` declares `"lint": "eslint . --max-warnings=0"` but the `eslint` binary + flat config are not installed yet — flagged in the FE log (Stage 7 onward) as the Phase 1.5 carry-over. CI ship-blocker = install ESLint + author `eslint.config.js` in the same PR that ships `ci.yml`. |
| Unit tests | **Vitest** (`pnpm -w test`) | MIT | Already wired. Runs RTL + jsdom. |
| Coverage | **Vitest `--coverage` (V8 reporter, no extra dep)** | MIT | Report uploaded as artifact + posted to PR via `davelosert/vitest-coverage-report-action` (MIT). **No %-gate.** |
| Build | **Vite** (`pnpm -w build`) | MIT | Already wired. Produces `dist/` per app. |
| Bundle-size gate | **`size-limit` + `@size-limit/preset-app`** | MIT | The 180 KB budget needs a CI gate, not just human discipline. Used by React, Redux, etc. Comments deltas on the PR. |
| E2E | **Playwright** (`@playwright/test`) | Apache-2.0 | Most-used OSS browser-automation tool; ships its own browsers + GHA cache. Phase 2 carry-over flagged as deferred — wire here. |
| Accessibility audit | **axe-core via `@axe-core/playwright`** | MPL-2.0 | The standard a11y engine (used by Google, Microsoft, Deque). Runs inside the Playwright job. |
| OpenAPI drift | **`pnpm api:gen` + `git diff --exit-code`** | n/a | FE consumes `complaints/docs/openapi.json` via orval. Re-run codegen in CI — any diff means the FE forgot to re-sync. |
| SAST | **CodeQL** via `github/codeql-action` | Proprietary; free for public + private | GitHub's own. Catches JS/TS CVE patterns. |
| Dependency CVEs | **GitHub Dependency Review** (`actions/dependency-review-action@v4`) | Proprietary; free | Fails PRs that introduce high-severity vulnerable deps. |
| Dependency updates | **Dependabot** (`.github/dependabot.yml`) | Proprietary; free | Weekly PRs for `npm`, `github-actions`. |
| Secret scanning | **Gitleaks** (`gitleaks/gitleaks-action@v2`) | MIT | Most-starred OSS secret scanner; offline; low false-positive. |
| Container image scan | **Trivy** (`aquasecurity/trivy-action`) | Apache-2.0 | Scans the web image we ship (`nginx:alpine` + `dist/`) for base-image CVEs. |
| Image registry | **ghcr.io** (`ghcr.io/sunilgithub123/complaints-web`) | Free | Same reasoning as BE — `GITHUB_TOKEN`, no PAT. |
| Image build | **`docker/build-push-action@v5`** + Buildx | Apache-2.0 | Multi-stage Dockerfile (`node:22-alpine` build → `nginx:alpine` runtime). |
| Test-result UI in PR | **`dorny/test-reporter@v2`** | MIT | Renders Vitest + Playwright JUnit reports inline on the PR Files / Checks tab. |
| Lighthouse (perf budget) | **Lighthouse CI** (`treosh/lighthouse-ci-action@v12`) | Apache-2.0 | Runs after build against `dist/` served by `npx serve`. Asserts a perf-budget JSON. **Warn-only** until we settle a baseline. |

> **SARIF note.** Public repo (per §9) → CodeQL + Trivy SARIF lands in
> the GitHub **Security** tab for free, no Advanced Security needed.
> Same as BE.

---

## 3. Workflow files (target end-state)

All under `.github/workflows/`. Each file pins action versions by major
(`@v4`), uses `concurrency` to cancel stale runs, and includes
`permissions: { contents: read }` by default — escalated per-job only when
needed (`packages: write` for ghcr.io push).

| File | Triggers | Avg duration | Required for merge? |
|---|---|---|---|
| `ci.yml` | `pull_request`, `push: main` | ~2 min cached | ✅ |
| `quality.yml` | `pull_request`, `push: main` | ~2 min | ✅ (selected jobs) |
| `e2e.yml` | `pull_request`, `push: main` | ~5 min | ✅ once stable; ❌ while seeding |
| `codeql.yml` | `pull_request`, `push: main`, `schedule: weekly` | ~3 min | ✅ |
| `image.yml` | `push: main`, `push: tags v*` | ~3 min | ❌ (post-merge only) |
| `lighthouse.yml` | `pull_request` | ~3 min | ❌ (report-only) |
| `deploy-test.yml` | `workflow_dispatch` (manual) | ~1 min | ❌ — **stubbed**, enabled once test hosting lands (Phase 2 ENV) |

### 3.1 `ci.yml` — typecheck + lint + unit + build + size + api codegen freshness

```
jobs:
  build-test:
    - checkout
    - pnpm/action-setup
    - setup-node (22 LTS, cache: pnpm)
    - pnpm install --frozen-lockfile
    - pnpm -w typecheck
    - pnpm -w lint
    - pnpm -w test -- --coverage --reporter=junit --reporter=default
    - pnpm -w build
    - pnpm -w size            # size-limit; fails on budget breach
    - dorny/test-reporter (vitest junit)
    - davelosert/vitest-coverage-report-action
    - upload-artifact: apps/*/dist, coverage

  api-codegen-fresh:
    needs: build-test
    - checkout
    - pnpm install --frozen-lockfile
    - pnpm api:gen
    - git status --porcelain -- packages/api/src
      # non-empty = the committed openapi.json and the committed
      # generated/ are out of step (someone edited the spec but
      # forgot to regen, or hand-edited the regen output)
```

**Internal-consistency, not cross-repo drift.** Earlier iterations of this
job checked out the BE repo's `main` and asserted that the FE's
committed `openapi.json` matched it. That created a cross-repo race —
every BE merge silently broke every open FE PR until a sync PR landed,
and the sync PR itself raced subsequent BE merges. For a small team
where the same humans ship both sides, the realistic foot-gun is
"edited `openapi.json`, forgot to run `pnpm api:gen`" — which is a
single-repo check needing no BE checkout. Syncing the BE spec into
`packages/api/openapi.json` stays a deliberate human step performed as
part of a feature PR; integration drift between FE and a running BE is
caught by E2E tests (§3.3), which is the right layer for that signal.

### 3.2 `quality.yml` — secret scan + dependency review

```
jobs:
  gitleaks:           # fails PR on any finding
  dependency-review:  # actions/dependency-review-action@v4 (PR-only)
```

Coverage + ESLint already run in `ci.yml` (and ESLint is the lint gate
there); no need to duplicate. We deliberately *don't* add a separate
"complexity" tool — TS strict mode + ESLint's `complexity` /
`max-lines-per-function` rules are enough.

**Failure policy (initially conservative):**

| Job | Fails PR on | Rationale |
|---|---|---|
| `typecheck` (`ci.yml`) | Any TS error | Hard gate; no green allowed otherwise. |
| `lint` (`ci.yml`) | New ESLint errors on changed files | Whole-repo lint as warn-only first PR, flip to error after baseline. |
| `test` (`ci.yml`) | Any failing Vitest test | Standard. |
| `size` (`ci.yml`) | Entry chunk > 180 KB gzipped | Real gate; matches FE log budget. |
| `api-codegen-fresh` (`ci.yml`) | `pnpm api:gen` produces any diff under `packages/api/src/` | Forces the dev who edited `openapi.json` to also commit the regenerated bindings. |
| `gitleaks` | Any finding | Secrets are P0. |
| `dependency-review` | Any new HIGH or CRITICAL CVE | Replaces a paid SCA scanner. |
| `e2e` | Any failing Playwright spec | Hard gate once §3.3 settles. |
| `coverage` | **Never** | Per minimum-test policy. |
| `lighthouse` | **Never** (initially) | Report perf-budget deltas; tighten after one clean week. |

### 3.3 `e2e.yml` — Playwright + axe

```
jobs:
  e2e:
    services:
      backend:
        image: ghcr.io/sunilgithub123/complaints:main   # BE image from sibling CI
        ports: ['8080:8080']
        env:
          SPRING_PROFILES_ACTIVE: dev
          BOOTSTRAP_ADMIN_EMPLOYEE_ID: ADMIN001
          BOOTSTRAP_ADMIN_PASSWORD: ChangeMe!123
          # …
      postgres:
        image: postgres:16-alpine
    steps:
      - checkout
      - pnpm install --frozen-lockfile
      - pnpm -w build
      - pnpm exec playwright install --with-deps chromium
      - pnpm -w e2e          # runs Playwright + axe checks; produces junit + traces
      - upload-artifact: playwright-report, traces
      - dorny/test-reporter (playwright junit)
```

**Carry-over closure:** wires the Phase 2 Stage 7 deferred "Playwright +
axe-core E2E" into the pipeline. Specs land alongside this workflow (one
smoke spec per top-level route is enough for v1).

### 3.4 `codeql.yml` — GitHub-native SAST

Generated from GitHub's JavaScript / TypeScript template, queries:
`security-extended` + `security-and-quality`. Schedule: weekly Sunday +
on PR. Free on private and public.

### 3.5 `image.yml` — web image to ghcr.io

```
jobs:
  build-image:
    permissions: { contents: read, packages: write }
    - checkout
    - setup-node + pnpm install --frozen-lockfile + pnpm -w build
    - docker/setup-buildx-action
    - docker/login-action (ghcr.io, GITHUB_TOKEN)
    - docker/build-push-action (tags: sha-short, branch, latest, semver)
    - trivy-action (image scan; HIGH/CRITICAL → warn first, fail after one clean week)
```

Image naming: `ghcr.io/sunilgithub123/complaints-web:{<sha7>,main,latest,v<semver>}`.
Runtime image = `nginx:alpine` serving `apps/web/dist/` with an SPA
fallback (`try_files $uri /index.html;`). Backend URL is injected at
container start via `envsubst` on `apps/web/dist/runtime-config.js` —
*never* baked into the build (so the same image promotes test → prod).

### 3.6 `lighthouse.yml` — perf budget (report-only)

```
jobs:
  lighthouse:
    - checkout
    - pnpm install + pnpm -w build
    - npx -y serve apps/web/dist -l 4173 &
    - treosh/lighthouse-ci-action with assertions in .lighthouserc.json
      (performance >= 0.85, accessibility >= 0.95, no JS > 200 KB transferred)
```

Comments scores + delta on the PR. **Warn-only initially.**

### 3.7 `deploy-test.yml` — stubbed

Skeleton with secret slots (`TEST_WEB_HOST`, `TEST_WEB_USER`,
`TEST_WEB_SSH_KEY`, `TEST_BACKEND_URL`); body `if: false`-gated until the
test env exists. Mirrors BE.

---

## 4. Supporting config files

| File | Purpose |
|---|---|
| `.github/dependabot.yml` | Weekly updates for `npm`, `github-actions`. Auto-rebase. Auto-merge security + patch via a tiny extra workflow. |
| `.github/codeql/codeql-config.yml` | Limit CodeQL to `apps/**/src` + `packages/**/src` (skip `dist`, generated, fixtures). |
| `.gitleaks.toml` | Allowlist for fixture JWTs / mock OTPs in `*.test.tsx`. |
| `.size-limit.json` | One entry per app; the web entry chunk capped at `180 KB` gzipped. |
| `.lighthouserc.json` | Assertions per §3.6. |
| `playwright.config.ts` | `baseURL` from env; CI reporter `junit + html`; retries 2 on CI. |
| `.github/PULL_REQUEST_TEMPLATE.md` | Match the BE template's "CI checks expected to pass" reminder. |

---

## 5. Secrets (GitHub repo → Settings → Secrets and variables → Actions)

| Secret | Required by | Phase |
|---|---|---|
| `GITHUB_TOKEN` | All (built-in) | Now |
| _none for ghcr.io_ | `image.yml` uses `GITHUB_TOKEN` | Now |
| `TEST_WEB_HOST` / `TEST_WEB_USER` / `TEST_WEB_SSH_KEY` | `deploy-test.yml` | Phase 2 |
| `TEST_BACKEND_URL` | `e2e.yml` (when pointed at a deployed BE), `deploy-test.yml` | Phase 2 |

> **Never** add SonarCloud / Snyk / Chromatic / Percy tokens — those tools
> are intentionally out of scope (cost or noise).

---

## 6. Branch protection (one-time GitHub UI setup)

After all workflows are green at least once on `main`, enable:

- **Require PRs** to merge into `main`.
- **Required status checks** (must pass before merge):
  - `build-test`, `api-codegen-fresh` (from `ci.yml`)
  - `gitleaks`, `dependency-review` (from `quality.yml`)
  - `analyze (javascript-typescript)` (from `codeql.yml`)
  - `e2e` (from `e2e.yml`) — *once stable, see §3.3*
- **Require branches up to date** before merging.
- **Auto-merge** allowed for Dependabot security + patch PRs.
- **No bypassing for admins.**

---

## 7. Rollout plan — 3 small PRs

Each PR is independently green and shippable. Total ETA: roughly half a
day.

### PR #1 — `ci.yml` + Dependabot + size budget
- **Files:** `.github/workflows/ci.yml`, `.github/dependabot.yml`,
  `.size-limit.json`, fix the apps/web ESLint script carry-over.
- **Risk:** low. Reuses already-green local scripts.
- **Done when:** `build-test`, `openapi-drift`, and `size` checks appear
  on the next PR.

### PR #2 — `quality.yml` + `codeql.yml` + secret scan
- **Files:** `.github/workflows/quality.yml`, `.github/workflows/codeql.yml`,
  `.github/codeql/codeql-config.yml`, `.gitleaks.toml`.
- **Risk:** low — these are read-only analysers.
- **Done when:** Gitleaks blocks a deliberately-leaked test token;
  CodeQL alerts appear in Security tab.

### PR #3 — `e2e.yml` + `image.yml` + `lighthouse.yml` + `deploy-test.yml` stub
- **Files:** the four workflow files, one or two smoke Playwright specs
  per top route, `playwright.config.ts`, `.lighthouserc.json`,
  multi-stage `Dockerfile` for `apps/web` + nginx conf + runtime-config
  shim, doc updates.
- **Risk:** medium — Playwright + BE image wiring is the new bit. Mitigate
  by starting with one tiny spec (`/login → OTP page renders`).
- **Done when:** a push to `main` publishes
  `ghcr.io/sunilgithub123/complaints-web:main` + SHA-tagged image; Trivy
  + Lighthouse + Playwright reports visible in run; pulling the image
  locally + `docker run -p 8081:80 ghcr.io/...:main` shows the SPA.

---

## 8. What we are *not* doing (and why)

| Skipped | Why |
|---|---|
| **SonarCloud** | TS strict + ESLint + CodeQL cover the same surface. Extra dashboard not worth the overhead. Same call as BE. |
| **Chromatic / Percy** (visual regression) | Free tiers are small; visual flakiness > signal at our size. Revisit if a screenshot-regression bug actually escapes. |
| **Bundlewatch SaaS** | `size-limit` does the same, locally, free, with PR comments. |
| **Snyk / Mend / Codacy (paid)** | Dependency Review + Dependabot + CodeQL give 80 % at 0 cost. |
| **Self-hosted runners** | GitHub-hosted is plenty for a 2 min build. |
| **Hard coverage gate** | Conflicts with minimum-test policy. Reported, not enforced. |
| **Sigstore / cosign image signing** | Phase 7 (production hardening). |
| **Renovate** | Dependabot covers `npm` + `github-actions`. |
| **Mobile (Expo / EAS) builds** | The Expo app is still v2 surface (`ROADMAP.md`). When it lands, EAS Build's free tier + a separate `mobile.yml` will own it. |
| **Actual cloud deploy in CI today** | Phase 2 ENV is the gate. |

---

## 9. Open questions — resolved 2026-06-22

These mirror the BE answers so the two pipelines stay consistent.

| # | Question | Answer | Implication |
|---|---|---|---|
| 1 | Public or private repo? | **Public** (same as BE) | SARIF uploads from CodeQL / Trivy land in the Security tab for free. **Still skip SonarCloud.** |
| 2 | ghcr.io image namespace owner? | **`SunilGithub123`** | Image published as **`ghcr.io/sunilgithub123/complaints-web`** (ghcr.io lowercases the owner segment automatically). |
| 3 | Auto-merge Dependabot security + patch PRs after green CI? | **Yes** | Adds a tiny `dependabot-auto-merge.yml` workflow gated on `version-update:semver-patch` + security. |

---

## 10. Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-06-22 | **Skip SonarCloud, Chromatic, Bundlewatch SaaS.** Use ESLint + TS strict + CodeQL + `size-limit` + Lighthouse + Trivy + Dependency Review + Gitleaks instead. | Zero recurring cost, no extra accounts; OSS covers the same surface. |
| 2026-06-22 | **ghcr.io, not Docker Hub.** | Matches BE; free private quota; `GITHUB_TOKEN`-only. |
| 2026-06-22 | **`size-limit` is a hard gate (180 KB entry chunk gzipped).** | The FE log already tracks the budget per stage; CI just enforces what reviewers were checking by hand. |
| 2026-06-22 | **OpenAPI drift = re-run `pnpm api:gen` against BE's `main` snapshot and `git diff --exit-code`.** | Closes the cross-repo sync gap surfaced repeatedly in FE Stage 7 / 8b. |
| 2026-06-22 | **Wire Playwright + axe in this CI (closes Phase 2 Stage 7 deferral).** | The smoke-test deficit is the biggest single risk left in the FE pipeline. |
| 2026-06-22 | **Lighthouse warn-only initially.** | Establish a baseline before turning the dial. |
| 2026-06-22 | **No hard coverage % gate.** | Per backend `.github/copilot-instructions.md → Minimum-test policy`. |
| 2026-06-22 | **Doc moved from `complaints/docs/CI_CD_DESIGN_FRONTEND.md` (draft) to `complaints-frontend/docs/CI_CD_DESIGN.md`.** | Standalone, lives with the code it gates. BE's draft copy can be deleted once this is merged. |
| 2026-06-22 | **Replace cross-repo `openapi-drift` with self-contained `api-codegen-fresh`.** No more BE-repo checkout in CI; the job only asserts that the committed `openapi.json` and `packages/api/src/generated/**` are internally consistent. | The cross-repo check created a race (every BE merge silently failed every open FE PR until a sync PR landed; the sync PR then raced subsequent BE merges). For a small team where the same humans ship both sides, the realistic foot-gun is *"edited `openapi.json`, forgot to run `pnpm api:gen`"* — a single-repo, internal-consistency check needing no BE checkout. Syncing the BE spec stays a deliberate human step performed inside a feature PR; integration drift gets caught by E2E tests against a running BE in PR #3 (§3.3). When the OpenAPI becomes a published `@complaints/api-contract` npm package (second consumer / Phase 4 mobile), Dependabot replaces this check entirely. |

---

## 11. Useful pointers

- Backend CI mirror (read first):
  [`../../complaints/docs/CI_CD_DESIGN.md`](../../complaints/docs/CI_CD_DESIGN.md)
- FE architecture + perf budgets (the 180 KB number this CI enforces):
  [`FRONTEND_DESIGN.md`](FRONTEND_DESIGN.md)
- Implementation log (tracks the 180 KB budget per stage + the
  carry-overs this CI closes):
  [`IMPLEMENTATION_LOG.md`](IMPLEMENTATION_LOG.md)
- **CI/CD implementation log** (what's shipped per CI PR, incidents +
  fixes, decision log — the running counterpart to *this* design doc):
  [`CI_CD_IMPLEMENTATION_LOG.md`](CI_CD_IMPLEMENTATION_LOG.md)
- Delivery phases (which checks gate which phase):
  [`ROADMAP.md`](ROADMAP.md)
- Repo conventions enforced by lint + typecheck:
  [`../.github/copilot-instructions.md`](../.github/copilot-instructions.md)
- Minimum-test policy CI honours: same file →
  *Minimum-test policy* section.


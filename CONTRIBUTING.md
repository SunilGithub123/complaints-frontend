# Contributing — `complaints-frontend`

Thanks for working on the Complaint Resolution System frontend. This is the short version; the full design lives in [`../complaints/docs/FRONTEND_DESIGN.md`](../complaints/docs/FRONTEND_DESIGN.md).

## Prerequisites

- **Node 20.19+** or **22 LTS** (`.nvmrc` pins the version; use `nvm use` or `fnm use`).
- **pnpm 10+** (`npm install -g pnpm@10`).
- The backend running locally at `http://localhost:8080` (see [`../complaints/docs/ENVIRONMENT_SETUP.md`](../complaints/docs/ENVIRONMENT_SETUP.md)).
- An IDE (VS Code recommended for TS/React; IntelliJ IU also works).

## First-time setup

```bash
git clone <repo-url>
cd complaints-frontend

# 1. Install all workspace deps (pnpm reads pnpm-workspace.yaml)
pnpm install

# 2. (One-time, in sibling repo) start the backend
cd ../complaints && docker compose up -d && ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev &
cd -

# 3. Run the web dev server
pnpm --filter web dev          # → http://localhost:5173
```

## Day-to-day commands

```bash
pnpm dev                       # parallel dev for all apps (currently just web)
pnpm --filter web dev          # web only

pnpm build                     # build all apps + packages
pnpm --filter web build        # web only

pnpm lint                      # lint all packages
pnpm typecheck                 # tsc --noEmit across the workspace
pnpm test                      # Vitest (web) + Jest (mobile, when added)

pnpm api:gen                   # regenerate @complaints/api from backend OpenAPI (Phase 1+)

pnpm clean                     # remove all build artefacts + node_modules
```

## Branching & commits

- **Long-lived branches:** `main` (→ prod web/mobile releases), `develop` (→ test env).
- **Feature branches:** `feat/<area>-<short-desc>`, e.g. `feat/web-staff-login`.
- **Bug branches:** `fix/<area>-<short-desc>`.
- **Conventional commits** (relaxed): `<type>(<area>): <imperative summary>`. Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `build`, `ci`, `perf`, `a11y`.
  - `feat(web/auth): add force-change-password screen`
  - `fix(api): regenerate after backend ErrorCode addition`
  - `chore(deps): bump Vite to 6.0.7`
- Squash-merge PRs into `develop` / `main`.

## PR rules

- Use [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md). Tick what applies, justify skips.
- CI must be green — lint, typecheck, test, build, (Phase 1+) bundle-size, Lighthouse, axe-core.
- At least 1 reviewer approval. Solo-dev: still open a PR, never push to `develop`/`main` directly.

## Code conventions (the short list)

The full list is in [`.github/copilot-instructions.md`](./.github/copilot-instructions.md). The non-negotiables:

1. **TypeScript `strict`** everywhere. No `any`.
2. **Records / type aliases over `class`.** Records for DTOs (since they come from the generated `@complaints/api`).
3. **No axios. No moment. No lodash full import. No Redux.** Use the generated client, `date-fns`, named imports, Zustand.
4. **All business datetimes use IST** via `@complaints/utils`.
5. **Server state → TanStack Query. Client state → Zustand. Forms → React Hook Form + Zod.**
6. **Tests:** minimum-test policy — 1 happy + 1 unhappy per change.
7. **Performance budgets** (Phase 1+): blocking CI gates. See `../complaints/docs/FRONTEND_DESIGN.md §11.2`.

## When you change…

| You change… | You also must… |
|-------------|---------------|
| The backend OpenAPI spec | Re-run `pnpm api:gen` and commit the regenerated `packages/api/src/**`. |
| A user-facing screen | Add the corresponding screenshot to the PR. Confirm a11y via `pnpm test:a11y` once wired (Phase 7). |
| A shared package | Bump usage sites in the same PR; never leave a workspace in a broken state. |
| A FE convention | Update [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) and ping the team. |
| The build / CI pipeline | Document why in the PR description; reviewers should see how to roll back. |

## Project structure (high-level)

```
complaints-frontend/
├── apps/
│   ├── web/         React 19 + Vite + TS
│   └── mobile/      React Native + Expo (Phase 4+)
├── packages/
│   ├── api/         Generated OpenAPI client + Zod (Phase 1+, do NOT hand-edit)
│   ├── i18n/        en / hi / mr message catalogues
│   ├── ui-tokens/   Shared design tokens
│   └── utils/       Date (IST), formatters, error-code map
├── .github/         CI workflows + PR template + Copilot instructions
└── docs/            (FE-specific docs, if any — keep it light; whole-system docs live in ../complaints/docs/)
```

## Getting help

- Design / UX questions → check `../complaints/docs/FRONTEND_DESIGN.md`, then open a discussion.
- API contract questions → check `../complaints/docs/TECHNICAL_DESIGN.md §5`, then ping backend.
- Bug / regression → open an issue with reproduction steps + screenshot.


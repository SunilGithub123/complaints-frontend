# AGENTS.md

> Pointer file for AI agents in this repo (GitHub Copilot, Claude, Cursor, Codex CLI, Devin, etc.).
> Humans: see [`README.md`](README.md).

## TL;DR

- **pnpm + Turborepo monorepo** for the Complaint Resolution System frontend.
- `apps/web` — React 19 + Vite + TS (consumer PWA + staff portal).
- `apps/mobile` — React Native + Expo (landing in Phase 4).
- `packages/{api,i18n,ui-tokens,utils}` — shared.
- Sibling repo **`../complaints/`** holds the Spring Boot backend (API-only).
- The detailed conventions you must follow are in **[`.github/copilot-instructions.md`](.github/copilot-instructions.md) — read that file first**, then come back here.

## Where to find what

| You need to know… | File |
|-------------------|------|
| Code conventions, hard rules, test policy | [`.github/copilot-instructions.md`](.github/copilot-instructions.md) |
| **What has actually shipped + incidents per stage** | [`docs/IMPLEMENTATION_LOG.md`](docs/IMPLEMENTATION_LOG.md) |
| **CI/CD pipeline — design + what's shipped per CI PR** | [`docs/CI_CD_DESIGN.md`](docs/CI_CD_DESIGN.md) · [`docs/CI_CD_IMPLEMENTATION_LOG.md`](docs/CI_CD_IMPLEMENTATION_LOG.md) |
| Backend implementation log (sibling repo) | [`../complaints/docs/IMPLEMENTATION_LOG.md`](../complaints/docs/IMPLEMENTATION_LOG.md) |
| Frontend design (stack, UX flows, hosting, perf budgets) | [`../complaints/docs/FRONTEND_DESIGN.md`](../complaints/docs/FRONTEND_DESIGN.md) |
| Delivery phases | [`../complaints/docs/ROADMAP.md`](../complaints/docs/ROADMAP.md) |
| Business rules / user roles | [`../complaints/docs/BRD.md`](../complaints/docs/BRD.md) |
| Backend API contracts | [`../complaints/docs/TECHNICAL_DESIGN.md`](../complaints/docs/TECHNICAL_DESIGN.md) §5 |
| Backend error catalogue (i18n key source) | [`../complaints/src/main/java/com/example/complaints/common/exception/ErrorCode.java`](../complaints/src/main/java/com/example/complaints/common/exception/ErrorCode.java) |
| How to contribute (branches, commits, tests) | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## Run locally (one-liner orientation)

```bash
# In ../complaints (one-time): start backend so /v3/api-docs is reachable
docker compose up -d
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# In complaints-frontend
pnpm install
pnpm --filter web dev          # → http://localhost:5173
```

## Five rules you must not break

1. **TypeScript `strict` everywhere.** No `any` in prod code. Use `unknown` + narrow.
2. **No axios / no moment / no lodash full import / no Redux.** Use the generated `@complaints/api` fetch client, `date-fns`, named lodash imports, Zustand.
3. **All datetimes are IST.** Use `formatIstDateTime` / `IST_TIMEZONE` from `@complaints/utils`.
4. **Server state → TanStack Query. Client state → Zustand.** Never fetch in `useEffect`.
5. **Minimum tests.** 1 happy + 1 unhappy is the bar. No exhaustive matrices. See `.github/copilot-instructions.md → Minimum-test policy`.

## Three design rules (do not over-engineer)

1. **SOLID applied proportionally** — not academically. One small file per responsibility, not a `useEverything()` god-hook.
2. **Patterns only when they earn their keep** — Strategy / Factory / Decorator-equivalent (route guards) are welcome where there are real alternatives. Don't add an interface that has one implementation; don't add a `<Wrapper>` for one child.
3. **Add the abstraction the *second* time you need it, not the first.** Refactoring towards a pattern is cheap; refactoring out of speculative abstractions is expensive.

Full guidance: `.github/copilot-instructions.md → "Design principles — SOLID, but don't over-engineer"`.

## When opening a PR

Use `.github/PULL_REQUEST_TEMPLATE.md`'s checklist. CI is the gate; expect it to enforce lint + typecheck + tests + bundle size + Lighthouse + axe-core (gates added phase-by-phase per `ROADMAP.md`).


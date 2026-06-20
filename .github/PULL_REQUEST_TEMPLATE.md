<!--
PR title format: `<area>: <short imperative summary>`
Examples:  `web/auth: add staff login form`
           `mobile/technician: add resolve-with-image flow`
           `api: regenerate from backend OpenAPI`
-->

## What this PR does

<!-- 1–3 sentences. Link the issue if any. -->

## Why

<!-- Business reason or design pointer. Reference `../complaints/docs/...md §X.Y` where relevant. -->

## How

<!-- Brief implementation summary. Mention any non-obvious choices. -->

## Checklist

> Tick what applies. Anything skipped should have a one-line justification.

- [ ] Follows [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) (TS strict, no axios/moment/lodash-full, TanStack Query for server state, Zustand for client state, generated `@complaints/api`).
- [ ] **No speculative abstractions** — no new wrapper component / hook / package without ≥ 2 real call-sites. (See *Design principles — SOLID, but don't over-engineer* in the instructions.)
- [ ] All business datetimes use `IST_TIMEZONE` / `formatIstDateTime` from `@complaints/utils`.
- [ ] Backend errors mapped via `errorCodes.*` i18n keys; no hard-coded error strings.
- [ ] Tests added per the **minimum-test policy** (`copilot-instructions.md`): **1 happy + 1 failure path** for the affected component / hook. *No exhaustive matrices.*
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passes locally.
- [ ] If new dependency added: weight justified vs the bundle budget (`FRONTEND_DESIGN.md §11.2`).
- [ ] No `console.log` / debug code left in prod source.
- [ ] No secrets / `.env` files committed.
- [ ] If touching `@complaints/api`: regenerated via `pnpm api:gen` (no hand-edits).
- [ ] If touching a route: code-split via `React.lazy()` if it's not on the critical path.
- [ ] `../complaints/docs/FRONTEND_DESIGN.md` updated if architecture / UX flow / convention changed.

## Risk & rollback

<!-- What's the blast radius if this is wrong in prod? What's the rollback path? Web: previous git-SHA via `gsutil rsync`. Mobile: EAS `republish` previous update. -->

## Screenshots / videos (UI changes)

<!-- For UI changes, attach a screenshot or a short Loom. Link the backend PR if cross-cutting. -->


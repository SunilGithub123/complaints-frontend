# Complaint Resolution System — Frontend

> Sibling repo to [`complaints/`](../complaints) (Spring Boot backend).
> Detailed design lives in [`complaints/docs/FRONTEND_DESIGN.md`](../complaints/docs/FRONTEND_DESIGN.md).

pnpm + Turborepo monorepo containing:

```
apps/
├── web/        React 19 + Vite + TS  (consumer PWA + staff portal)
└── mobile/     React Native + Expo   (technician + engineer app)   ← landing in Phase 4

packages/
├── api/        Generated OpenAPI client + Zod schemas (orval)      ← wired in Phase 1
├── i18n/       en / hi / mr message catalogues                     ← wired in Phase 6
├── ui-tokens/  Shared design tokens                                 ← grows with screens
└── utils/      Date (IST), formatters, error-code map               ← shared helpers
```

## Prerequisites

- Node **20.19+** or **22 LTS** (`.nvmrc` pins the version)
- pnpm **10+** (`npm install -g pnpm@10`)
- The backend running locally at `http://localhost:8080` (see `../complaints/docs/ENVIRONMENT_SETUP.md`)

## Quickstart

```bash
pnpm install
pnpm --filter web dev          # → http://localhost:5173
```

## Day-to-day commands

```bash
pnpm dev                       # parallel dev for all apps (currently just web)
pnpm build                     # builds everything
pnpm lint                      # lint all packages
pnpm test                      # run all tests (Vitest + Jest)
pnpm api:gen                   # regenerate @complaints/api from the backend's OpenAPI spec (Phase 1+)
```

## Where to find what

| Topic | File |
|-------|------|
| Frontend design (stack, UX flows, hosting) | [`../complaints/docs/FRONTEND_DESIGN.md`](../complaints/docs/FRONTEND_DESIGN.md) |
| Delivery phases | [`../complaints/docs/ROADMAP.md`](../complaints/docs/ROADMAP.md) |
| Code conventions (records-vs-classes, test policy, SOLID guidance) | [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) |
| Contributing (branches, commits, PR checklist) | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |

## What is *not* here yet (deferred to roadmap phases)

- `apps/mobile/` (Expo) — lands in **Phase 4** with technician screens.
- `packages/api/` orval codegen — wired in **Phase 1** as soon as the backend exposes real endpoints.
- Tailwind + shadcn/ui setup — added when the first real screen lands in **Phase 1**.
- Full CI hardening gate (size-limit, Lighthouse, axe-core) — wired in **Phase 1** alongside the first real code.

This init is intentionally a *thin* starter so the conventions and structure are in place; the meat lands phase by phase per the roadmap.


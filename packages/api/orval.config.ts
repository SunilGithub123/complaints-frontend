import { defineConfig } from 'orval';

/**
 * Orval codegen config for `@complaints/api`.
 *
 * Two targets are emitted in one run:
 *   - `endpoints`  → typed TanStack Query hooks + TS interfaces (tags-split)
 *   - `zod`        → Zod validators mirroring the same operations (tags-split)
 *
 * The contract source is the *committed* OpenAPI snapshot at
 * `./openapi.json`, mirrored from `../../complaints/docs/openapi.json`
 * by Stage 3 of the backend. We never hit a running backend at FE build time.
 *
 * Generated files live under `src/generated/**` and are checked into VCS for
 * review-ability. Do **not** hand-edit them — change `openapi.json` (or this
 * config) and re-run `pnpm --filter @complaints/api api:gen`.
 */
export default defineConfig({
  endpoints: {
    input: './openapi.json',
    output: {
      target: './src/generated/endpoints.ts',
      schemas: './src/generated/schemas',
      mode: 'tags-split',
      client: 'react-query',
      httpClient: 'fetch',
      prettier: true,
      clean: true,
      override: {
        mutator: {
          path: './src/client.ts',
          name: 'customFetch',
        },
        query: {
          useQuery: true,
          useMutation: true,
          signal: false,
        },
      },
    },
  },
  zod: {
    input: './openapi.json',
    output: {
      target: './src/generated/zod',
      mode: 'tags-split',
      client: 'zod',
      prettier: true,
      clean: true,
    },
  },
});


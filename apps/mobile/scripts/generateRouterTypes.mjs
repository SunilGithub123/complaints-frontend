#!/usr/bin/env node
/**
 * Headless typed-routes generator for expo-router v4.
 *
 * `app.json` has `experiments.typedRoutes: true`, but the .d.ts file
 * that backs it (`.expo/types/router.d.ts`) is normally produced only
 * as a side effect of `expo start` / `expo run` / `expo prebuild`.
 * That is fine locally but leaves CI (which runs `typecheck` without
 * booting Metro) and cold checkouts staring at a stale or missing
 * file. When the file is stale, expo-router's `Href` union does not
 * include the newest routes, and callers have to `as never`-cast
 * their `router.push({ pathname })` payloads to compile.
 *
 * This script drives the same public API `@expo/cli` uses:
 *
 *   1. Build a `require.context`-shaped ponyfill for `./app`.
 *   2. Call `getTypedRoutesDeclarationFile(ctx)` (exported from
 *      `expo-router/build/typed-routes/generate`).
 *   3. Write the result to `.expo/types/router.d.ts`.
 *
 * Idempotent — safe to run in CI on every push. The `.expo/` folder
 * is gitignored so nothing is committed. Also invoked automatically
 * from the `typecheck` script via a `pretypecheck` hook so a fresh
 * `pnpm install && pnpm typecheck` "just works".
 *
 * If the underlying expo-router internals move, this script will
 * fail loud (import error) rather than silently drift — that is the
 * point of touching internals: we want to know the moment an SDK
 * bump changes the contract.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = resolve(HERE, '..');
const APP_ROOT = resolve(MOBILE_ROOT, 'app');
const OUT_DIR = resolve(MOBILE_ROOT, '.expo/types');
const OUT_FILE = resolve(OUT_DIR, 'router.d.ts');

if (!existsSync(APP_ROOT)) {
  console.error(`[router-typegen] app root not found: ${APP_ROOT}`);
  process.exit(1);
}

// expo-router's typegen internals + the require.context ponyfill it
// ships live under `build/`. We resolve via `createRequire` because
// this file is ESM but expo-router's build output is CJS.
const require_ = createRequire(pathToFileURL(resolve(MOBILE_ROOT, 'package.json')));

let getTypedRoutesDeclarationFile;
let requireContextPonyFill;
try {
  ({ getTypedRoutesDeclarationFile } = require_(
    'expo-router/build/typed-routes/generate',
  ));
  requireContextPonyFill = require_(
    'expo-router/build/testing-library/require-context-ponyfill',
  ).default;
} catch (err) {
  console.error(
    '[router-typegen] failed to load expo-router internals — SDK upgrade probably moved the entry points.',
    err,
  );
  process.exit(1);
}

// expo-router's default context regex (`EXPO_ROUTER_CTX_IGNORE` in
// `expo-router/_ctx-shared`) is really an INCLUDE pattern: match all
// `.tsx?` files, minus the three special sentinels `+api`, `+html`,
// `+native-intent`. We layer one extra exclusion so colocated
// `*.test.tsx` / `*.spec.tsx` files inside `app/` don't appear in
// the typed-routes union (they never do at runtime because Metro's
// resolver drops them via jest-expo's config; typegen has no such
// filter of its own).
const CTX_INCLUDE =
  /^(?:\.\/)(?!.*(?:\+api|\+html|\+native-intent|\.test|\.spec)\.[tj]sx?$).*\.[tj]sx?$/;

process.env.EXPO_ROUTER_APP_ROOT = APP_ROOT;
const ctx = requireContextPonyFill(APP_ROOT, true, CTX_INCLUDE);

const declaration = getTypedRoutesDeclarationFile(ctx);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, declaration, 'utf8');

console.log(`[router-typegen] wrote ${OUT_FILE}`);



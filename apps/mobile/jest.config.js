/**
 * Jest config for `apps/mobile`. The `jest-expo` preset wires Babel
 * (via `babel-preset-expo`), TS support, JSX transform, and ships
 * sensible default mocks for the Expo modules we use
 * (`expo-secure-store`, `expo-status-bar`, etc).
 *
 * `transformIgnorePatterns` is the one place this config materially
 * deviates from preset defaults: pnpm's isolated node_modules layout
 * puts RN ecosystem packages under
 * `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/...`, which
 * the preset's default regex doesn't recognise — Babel then refuses to
 * transform RN's Flow-typed polyfills and tests die parsing
 * `@react-native/js-polyfills/error-guard.js`.
 *
 * Fix: allow an optional `\.pnpm/[^/]+/node_modules/` prefix inside the
 * lookahead, so the same allow-list works whether the package is hoisted
 * to `node_modules/<pkg>` (npm/yarn) or sandboxed at
 * `node_modules/.pnpm/<id>/node_modules/<pkg>` (pnpm).
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    // Allow Babel to transform every RN / Expo ecosystem package AND
    // our own `@complaints/*` workspace packages, whether pnpm placed
    // them under `node_modules/<pkg>` or sandboxed at
    // `node_modules/.pnpm/<id>/node_modules/<pkg>`. The `@complaints/*`
    // packages ship raw TypeScript source via pnpm's `injected: true`
    // linker (see `apps/mobile/package.json#dependenciesMeta`) so they
    // need the same Babel pass as RN itself.
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:(?:jest-)?react-native[\\w-]*(?:/.*)?|@react-native[\\w-]*(?:/.*)?|expo[\\w-]*|@expo[\\w-]*(?:/.*)?|react-clone-referenced-element|@react-navigation(?:/.*)?|@unimodules(?:/.*)?|unimodules|sentry-expo|native-base|@complaints(?:/.*)?)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/.expo/'],
  collectCoverage: false,
};



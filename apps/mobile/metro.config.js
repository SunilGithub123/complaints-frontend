/**
 * Metro bundler config — monorepo aware.
 *
 * pnpm uses an isolated linker by default which puts real packages under
 * `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>` and exposes them
 * as symlinks. Metro's resolver follows the symlinks fine but transitive
 * peer deps (`@babel/runtime/*`, `react-native/*`) need to be reachable
 * via a node_modules walk from the resolved file's location.
 *
 * Two settings make this work:
 *
 *  1. `watchFolders = [monorepoRoot]` — so edits to `packages/*` and the
 *     root `node_modules/` trigger fast refresh.
 *  2. `nodeModulesPaths` adds the monorepo root's `node_modules` to the
 *     resolution candidates. Combined with `public-hoist-pattern` in the
 *     repo-root `.npmrc` (which lifts RN-ecosystem packages to that
 *     root `node_modules`), Metro finds every transitive RN dep without
 *     us having to flatten the whole tree.
 *
 * `disableHierarchicalLookup` is left at its default (false) — we WANT
 * Metro walking up the dir tree to find root-hoisted packages.
 *
 * See https://docs.expo.dev/guides/monorepos/ for the canonical pattern.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so edits to packages/* hot-reload.
config.watchFolders = [monorepoRoot];

// Resolve modules from the app first, then from the monorepo root where
// `public-hoist-pattern` puts the RN ecosystem.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];


module.exports = config;


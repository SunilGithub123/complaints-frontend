/**
 * Metro bundler config — monorepo aware.
 *
 * pnpm hoists workspace dependencies (`@complaints/*`) to the repo-root
 * `node_modules`, which Metro's default file-watcher / resolver doesn't see.
 * We extend the search path so Metro can find them and so changes in
 * `packages/*` trigger a fast refresh without a manual reload.
 *
 * See https://docs.expo.dev/guides/monorepos/ for the pattern.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so edits to packages/* hot-reload.
config.watchFolders = [monorepoRoot];

// 2. Resolve modules from both the app and the monorepo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. pnpm hoists packages into nested .pnpm dirs — disabling hierarchical
//    lookup keeps Metro from finding stale duplicates.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;


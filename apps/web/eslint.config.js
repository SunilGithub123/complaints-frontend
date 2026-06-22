/**
 * ESLint flat config (ESLint 9). Enforces the hard rules in
 * `.github/copilot-instructions.md` so CI can mechanically catch
 * banned imports / patterns instead of relying on reviewer diligence.
 *
 * Plugins:
 *   - @eslint/js                — recommended JS rules
 *   - typescript-eslint         — TS-aware recommended rules (no type-info,
 *                                 keeps CI fast; we'll opt into
 *                                 `recommendedTypeChecked` in Phase 1.5 if
 *                                 the lint job has headroom).
 *   - eslint-plugin-react       — React idioms
 *   - eslint-plugin-react-hooks — Rules of Hooks (non-negotiable)
 *   - eslint-plugin-react-refresh — keeps HMR boundaries clean
 *   - eslint-plugin-jsx-a11y    — accessibility hygiene (the a11y CI gate
 *                                 lives elsewhere — Lighthouse + axe — but
 *                                 cheap lint catches eat issues at PR time)
 *
 * Hard-rule enforcement (mirrors `.github/copilot-instructions.md`):
 *   - `no-restricted-imports` bans axios, moment, the lodash *default*
 *     import, class-validator, and Redux/MobX/Recoil/Jotai. Named lodash
 *     imports are still allowed (we don't actually use lodash today, but
 *     the rule says no full-import; named is fine).
 *   - `no-console` warns (Sentry breadcrumbs land in Phase 7; until then
 *     console.log is reviewer-flagged not blocked).
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

const BANNED_IMPORTS = [
  {
    name: 'axios',
    message:
      'Use the generated @complaints/api fetch client. See .github/copilot-instructions.md → "Hard rules".',
  },
  {
    name: 'moment',
    message: 'Use date-fns + date-fns-tz from @complaints/utils. moment is banned.',
  },
  {
    name: 'lodash',
    message:
      'Default-importing lodash is banned (bundle hit). Use named imports from lodash-es or just write the helper.',
  },
  {
    name: 'class-validator',
    message: 'Use zod. class-validator is banned.',
  },
  {
    name: 'redux',
    message: 'Use Zustand. Redux is banned at v1 scale.',
  },
  {
    name: '@reduxjs/toolkit',
    message: 'Use Zustand. Redux Toolkit is banned at v1 scale.',
  },
  {
    name: 'mobx',
    message: 'Use Zustand. MobX is banned at v1 scale.',
  },
  {
    name: 'recoil',
    message: 'Use Zustand. Recoil is banned at v1 scale.',
  },
  {
    name: 'jotai',
    message: 'Use Zustand. Jotai is banned at v1 scale.',
  },
];

export default [
  // 1. Ignore generated / built / dependency artefacts. Flat config
  //    requires this to live in its own object so the rest of the
  //    configs apply to everything *else*.
  {
    ignores: [
      'dist/**',
      'dist-node/**',
      'node_modules/**',
      '.turbo/**',
      // We re-export from @complaints/api which is generated; we never
      // import generated code directly into the web app, but if a
      // future stage does, this keeps lint useful.
      '**/generated/**',
      'eslint.config.js',
    ],
  },

  // 2. JS recommended.
  js.configs.recommended,

  // 3. TS-aware recommended (no type-checking — keeps CI under a minute).
  ...tseslint.configs.recommended,

  // 4. React + hooks + refresh + a11y — TS / TSX files only.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      // React 19 doesn't need the JSX-runtime import.
      'react/react-in-jsx-scope': 'off',
      // We rely on TS for prop typing.
      'react/prop-types': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Hard-rule enforcement.
      'no-restricted-imports': [
        'error',
        { paths: BANNED_IMPORTS },
      ],

      // Phase 7 will swap this for Sentry breadcrumbs; until then console
      // is annoying, not blocking. `console.warn` / `console.error` are
      // fine — they're how diagnostics surface in dev.
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // TS strict mode catches `any` in production code; we want lint to
      // warn loudly too so reviewers don't have to re-check every PR.
      '@typescript-eslint/no-explicit-any': 'error',
      // `_`-prefixed args / locals are deliberately unused (destructure
      // rest, fall-through cases, etc.). Matches our common pattern.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // 5. Test files — RTL helpers + Vitest globals + relaxed a11y for
  //    fixture markup. We deliberately do NOT relax `no-explicit-any`
  //    here; tests can use `unknown` + narrowing too.
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Fixture JSX often omits `htmlFor` etc. — acceptable in tests.
      'jsx-a11y/label-has-associated-control': 'off',
    },
  },

  // 6. Config files (vite/vitest configs run in Node).
  {
    files: ['vite.config.ts', 'vitest.config.ts', '*.cjs', '*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];


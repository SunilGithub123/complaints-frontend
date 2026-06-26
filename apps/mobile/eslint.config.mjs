/**
 * ESLint flat config (ESLint 9) for `apps/mobile`. Mirrors
 * `apps/web/eslint.config.js` minus the DOM-only bits:
 *
 *  - No `eslint-plugin-jsx-a11y` — its rules target HTML semantics
 *    (`<button>`, `htmlFor`, etc.) that don't exist in RN. A11y on
 *    mobile is enforced via `accessibilityLabel` / `accessible` props
 *    and the Maestro E2E pass listed in FRONTEND_DESIGN.md §9.2.
 *  - No `eslint-plugin-react-refresh` — RN uses Fast Refresh which has
 *    different boundary rules; the plugin's heuristics produce false
 *    positives on expo-router route files (default-export of a
 *    component is the framework contract there).
 *  - Same `no-restricted-imports` ban list as web. Same `no-console`
 *    warn level. Same `@typescript-eslint/no-explicit-any` = error.
 *
 * Lint also covers the auto-generated `.expo/` types? No — see the
 * ignore list. Treat anything Expo emits as opaque.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
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
  { name: 'redux', message: 'Use Zustand. Redux is banned at v1 scale.' },
  { name: '@reduxjs/toolkit', message: 'Use Zustand. Redux Toolkit is banned at v1 scale.' },
  { name: 'mobx', message: 'Use Zustand. MobX is banned at v1 scale.' },
  { name: 'recoil', message: 'Use Zustand. Recoil is banned at v1 scale.' },
  { name: 'jotai', message: 'Use Zustand. Jotai is banned at v1 scale.' },
];

export default [
  {
    ignores: [
      'node_modules/**',
      '.turbo/**',
      '.expo/**',
      'dist/**',
      'android/**',
      'ios/**',
      'eslint.config.js',
      'eslint.config.mjs',
      'babel.config.js',
      'metro.config.js',
      'jest.config.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // RN runs on Hermes / JSC; treat the global surface as Node-ish
        // (console, process, setTimeout, ...). `__DEV__` is RN-specific.
        ...globals.node,
        ...globals.es2024,
        __DEV__: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // RN doesn't need the JSX runtime import (Babel preset handles it).
      'react/react-in-jsx-scope': 'off',
      // TS provides prop typing.
      'react/prop-types': 'off',
      // expo-router route files default-export the screen component.
      'react/display-name': 'off',
      // RN's `<Text>` literals are fine — the web rule would flag them.
      'react/no-unescaped-entities': 'off',

      'no-restricted-imports': ['error', { paths: BANNED_IMPORTS }],

      'no-console': ['warn', { allow: ['warn', 'error'] }],

      '@typescript-eslint/no-explicit-any': 'error',
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

  // Test files — Jest globals + relaxed display-name rule for inline
  // wrapper components. Same shape as the web config's test override.
  {
    files: ['**/*.test.{ts,tsx}', 'jest.setup.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'react/display-name': 'off',
    },
  },
];


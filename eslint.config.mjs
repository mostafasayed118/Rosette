import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/**
 * Flat config for ESLint 9 + eslint-config-next 16.
 * `eslint-config-next/core-web-vitals` is already a flat config array, so it is
 * spread directly — no FlatCompat shim needed.
 */
const config = [
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      '.wrangler/**',
      '.worktrees/**',
      'node_modules/**',
      'docs/stitch-export/**',
      'next-env.d.ts',
      'coverage/**',
      '.freebuff/**',
      '.agents/**',
      'docs/superpowers/**',
      '.workbuddy-ai/**',
    ],
  },
  ...nextCoreWebVitals,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, '@typescript-eslint': tseslint },
    rules: {
      // React 19's compiler-era lint rules flag long-standing client patterns in
      // this app (hydrating state from localStorage/cookies inside an effect, and
      // reading Date.now() during render for date pickers). They are intentional
      // and covered by tests, so surface them as warnings instead of errors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'scripts/**/*.mjs'],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import reactHooks from 'eslint-plugin-react-hooks';

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
      '.worktrees/**',
      'node_modules/**',
      'docs/stitch-export/**',
      'next-env.d.ts',
      'coverage/**',
      '.freebuff/**',
    ],
  },
  ...nextCoreWebVitals,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
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

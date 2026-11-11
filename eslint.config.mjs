// Lint: typescript-eslint's recommended type-checked rules. Two are errors, the ones that have bitten: a promise nobody
// waits for or catches (a failure in it is an unhandled rejection: the page never reports ready and shows nothing),
// and a promise handed to something that ignores it. Every other recommended rule is a warning for now, so the
// check can gate CI from the first day; promote them as they are cleaned up. `npm run lint` shows everything,
// CI runs it with --quiet (errors only).
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const presets = [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked];
const asWarnings = Object.fromEntries(presets.flatMap((c) => Object.entries(c.rules ?? {}))
  .filter(([, v]) => v !== 'off' && v !== 0)
  .map(([k, v]) => [k, Array.isArray(v) ? ['warn', ...v.slice(1)] : 'warn']));

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'audit/**', 'pipeline/**', 'public/**', 'source/**', 'playwright-report/**', 'test-results/**', '.claude/**', '**/*.mjs', '**/*.js'] },
  ...presets,
  {
    languageOptions: { parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } },
    rules: {
      ...asWarnings,
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'eqeqeq': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // tests read values out of the page as `any` (page.evaluate): the unsafe-any family says nothing useful there
  {
    files: ['tests/**'],
    rules: Object.fromEntries(['no-unsafe-assignment', 'no-unsafe-member-access', 'no-unsafe-call', 'no-unsafe-return', 'no-unsafe-argument', 'no-explicit-any']
      .map((r) => [`@typescript-eslint/${r}`, 'off'])),
  },
);

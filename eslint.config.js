const nodeGlobals = Object.fromEntries(
  ['process', 'console', 'URL', 'fetch'].map((name) => [name, 'readonly']),
);
export default [
  { ignores: ['dist/**', 'deploy/**', 'coverage/**', 'node_modules/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': 'error', eqeqeq: 'error' },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: { document: 'readonly', window: 'readonly' } },
  },
];

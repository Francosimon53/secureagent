import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow unused vars (common during development)
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      // Allow explicit any (gradual typing)
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow empty functions (common in stubs)
      '@typescript-eslint/no-empty-function': 'off',
      // Allow require imports for dynamic loading
      '@typescript-eslint/no-require-imports': 'off',
      // Allow lexical declarations in case blocks
      'no-case-declarations': 'off',
      // Allow var (legacy code)
      'no-var': 'off',
      // Allow prefer-const (many valid use cases in codebase)
      'prefer-const': 'off',
      // Allow empty catch blocks
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Allow escape characters in strings (common in regex)
      'no-useless-escape': 'off',
      // Allow control characters in regex (used for security scanning)
      'no-control-regex': 'off',
      // Allow empty interfaces (used for extensibility)
      '@typescript-eslint/no-empty-object-type': 'off',
      // Allow this aliasing (used in callbacks)
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', '*.mjs', 'eslint.config.js'],
  }
);

import antfu from '@antfu/eslint-config'

export default antfu(
  {
    typescript: true,
    vue: true,
    stylistic: {
      semi: false,
      quotes: 'single',
    },
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/release/**',
    ],
  },
  {
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'unused-imports/no-unused-imports': 'error',

      'no-useless-return': 'warn',

      'vue/no-unused-refs': 'warn',

      'eslint-comments/no-unlimited-disable': 'error',
    },
  },
  {
    files: [
      'apps/client/electron/**/*',
    ],
    rules: {
      'node/prefer-global/process': 'off',
    },
  },
)

import antfu from '@antfu/eslint-config'

/**
 * 整个 monorepo 的 ESLint 基础配置（antfu 规则集 + 仓库统一约定）。
 * app 专属规则通过额外参数追加：
 *
 * ```mjs
 * export default createEslintConfig({ files: [...], rules: { ... } })
 * ```
 */
export function createEslintConfig(...blocks) {
  return antfu(
    {
      typescript: true,
      vue: true,
      stylistic: {
        semi: false,
        quotes: 'single',
      },
      ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/release/**'],
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
    ...blocks,
  )
}

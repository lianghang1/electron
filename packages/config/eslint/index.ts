import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import antfu from '@antfu/eslint-config'

/** 追加块：antfu 工厂第一个参数被固定为全局选项，这里只收 app 专属配置块 */
export type EslintBlock = TypedFlatConfigItem | TypedFlatConfigItem[]

/**
 * 整个 monorepo 的 ESLint 基础配置（antfu 规则集 + 仓库统一约定）。
 * app 专属规则通过额外参数追加：
 *
 * ```ts
 * export default createEslintConfig({ files: [...], rules: { ... } })
 * ```
 */
export function createEslintConfig(...blocks: EslintBlock[]) {
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
        'no-useless-return': 'warn',
        'no-console': 'off',
        'vue/no-unused-refs': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'unused-imports/no-unused-vars': 'off',
        'unused-imports/no-unused-imports': 'error',
        'eslint-comments/no-unlimited-disable': 'error',
        // curly all 补齐的单行大括号体天然占 2 条语句位，本行上限随之放宽避免互斥
        'curly': ['error', 'all'],
        'style/max-statements-per-line': ['error', { max: 2 }],
      },
    },
    ...blocks,
  )
}

import { createEslintConfig } from '@desktop/config/eslint'

export default createEslintConfig(
  {
    // 设计文档与 README 里的 TS 代码块只是示意，不参与 lint
    ignores: ['prd.md', 'README.md', 'docs/**'],
  },
  {
    files: ['apps/client/electron/**/*'],
    rules: {
      'node/prefer-global/process': 'off',
    },
  },
)

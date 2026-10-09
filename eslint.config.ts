import { createEslintConfig } from '@desktop/config/eslint'

export default createEslintConfig(
  {
    // 设计文档与 README 里的 TS 代码块只是示意，不参与 lint；
    // resources/ 是打包资源目录（图标与内部应用静态页），非 lint 对象
    ignores: ['README.md', 'docs/**', '.trae/**', '**/resources/**'],
  },
  {
    // IPC 契约必须保持 type alias：Main 侧 handle 包装用 keyof/Parameters 提取，
    // interface 无隐式索引签名会导致契约提取失效（原 ipc.ts 逐行 disable，域文件化后统一豁免）
    files: ['packages/shared/src/types/ipc/**'],
    rules: {
      'ts/consistent-type-definitions': 'off',
    },
  },
)

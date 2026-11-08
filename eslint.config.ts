import { createEslintConfig } from '@shell/config/eslint'

export default createEslintConfig(
  {
    // 设计文档里的 TS 代码块只是示意，不参与 lint；resources/ 是打包资源，非 lint 对象
    ignores: ['docs/**', '**/resources/**', 'resources/**'],
  },
  {
    // 这些文件必须保持 type alias 方法签名：interface 的属性函数签名与 zod class 方法
    // 在泛型约束/契约提取下失配（IPC handle 的 keyof/Parameters 提取、DomainInputLike 对 zod schema 的约束）
    files: ['packages/shared/src/types/ipc/**', 'packages/shared/src/domain.ts'],
    rules: {
      'ts/consistent-type-definitions': 'off',
      'ts/method-signature-style': 'off',
    },
  },
)

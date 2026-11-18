import { createEslintConfig } from '@shell/config/eslint'

export default createEslintConfig(
  {
    // 设计文档里的 TS 代码块只是示意，不参与 lint；resources/ 是打包资源，非 lint 对象；
    // unplugin 生成的声明（auto-imports/components/typed-router）非手写源码，顶部注释会触发 eslint-comments 规则
    ignores: ['docs/**', '**/resources/**', 'resources/**', 'apps/shell/src/types/*.d.ts'],
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
  {
    // 沙箱 preload 的 require 白名单只有 electron/events/timers/url——import 'node:process'
    // 会迫使主窗关沙箱；process.argv 用沙箱 polyfill 的全局（该环境必然存在）
    files: ['packages/bridge/src/preload.ts', 'packages/bridge/src/jsapi-preload.ts'],
    rules: {
      'node/prefer-global/process': 'off',
    },
  },
  {
    // 测试基建是 node:test + --experimental-strip-types（零测试框架依赖），
    // antfu 的 test/no-import-node-test 默认强制 vitest，对本仓不适用
    files: ['packages/devices/test/**'],
    rules: {
      'test/no-import-node-test': 'off',
    },
  },
)

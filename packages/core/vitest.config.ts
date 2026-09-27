import { defineConfig } from 'vitest/config'

// 被测对象（CallerResolver / AppRegistry / AppService / PermissionService / app-source）
// 均为无 electron 运行时依赖的纯逻辑（electron 仅 import type），node 环境直跑、零 mock
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})

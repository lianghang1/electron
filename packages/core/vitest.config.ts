import { defineConfig } from 'vitest/config'

// 被测对象均为无 electron 运行时依赖的纯逻辑（electron 仅 import type），node 环境直跑、零 mock：
// test/ 下的服务级单测 + src/devices/ 内联的纯函数单测（渲染器 / 缓冲器 / 归档清扫等）
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
})

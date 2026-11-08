import { defineConfig } from 'tsdown'

/** 显式 entry 对应 package.json exports 的每个子路径（dist 输出同名 .js + .d.ts） */
export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'logger/index': 'src/logger/index.ts',
    'settings/index': 'src/settings/index.ts',
    'storage/app-paths': 'src/storage/app-paths.ts',
  },
  dts: { resolver: 'tsc' },
  format: 'esm',
  external: ['electron'],
  fixedExtension: false,
  splitting: false,
})

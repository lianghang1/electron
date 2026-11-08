import { defineConfig } from 'tsdown'

/** 显式 entry 对应 package.json exports 的每个子路径（dist 输出同名 .js + .d.ts） */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    manifest: 'src/manifest.ts',
    capability: 'src/capability.ts',
    settings: 'src/settings.ts',
    events: 'src/events.ts',
    domain: 'src/domain.ts',
  },
  dts: { resolver: 'tsc' },
  format: 'esm',
  external: ['electron'],
  fixedExtension: false,
  splitting: false,
})

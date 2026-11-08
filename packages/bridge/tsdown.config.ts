import { defineConfig } from 'tsdown'

/** 三个子路径都是独立入口：preload / jsapi-preload 进沙箱，client 给业务应用 */
export default defineConfig({
  entry: {
    'preload': 'src/preload.ts',
    'client': 'src/client.ts',
    'jsapi-preload': 'src/jsapi-preload.ts',
  },
  dts: { resolver: 'tsc' },
  format: 'esm',
  external: ['electron'],
  fixedExtension: false,
  splitting: false,
})

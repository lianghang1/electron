import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'

/**
 * asar 自包含契约：打包后 asar 内没有 node_modules，所有依赖（含 @shell/* workspace 包）
 * 都必须由 Vite 编译进 bundle，不能外部化成裸导入。
 * internal 包的 exports 直接指向 src/*.ts，Vite 原生编译，dev 零前置构建（对齐 master）。
 */
const externalizeDeps = false

export default defineConfig({
  main: {
    build: {
      externalizeDeps,
      rollupOptions: {
        input: {
          'index': fileURLToPath(new URL('./electron/main/index.ts', import.meta.url)),
          'device-host': fileURLToPath(new URL('../../packages/devices/src/host/entry.ts', import.meta.url)),
        },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps,
      // 沙箱 preload 只认 CJS（ESM preload 要求 sandbox:false，放弃安全默认）；
      // 显式固定文件名，不受 app package.json type:module 影响
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
        },
        input: {
          index: fileURLToPath(new URL('./electron/preload/index.ts', import.meta.url)),
          jsapi: fileURLToPath(new URL('../../packages/bridge/src/jsapi-preload.ts', import.meta.url)),
        },
      },
    },
  },
  renderer: {
    root: fileURLToPath(new URL('./src', import.meta.url)),
    build: {
      rollupOptions: {
        input: fileURLToPath(new URL('./src/index.html', import.meta.url)),
      },
    },
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
})

import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'

/**
 * workspace 包内联声明（asar 自包含契约）：打包配置 files 只含 out/**，asar 内没有
 * node_modules，@shell/* 必须打进 bundle 才能运行。这些包有真实构建产物（dist/*.js），
 * 类型与解析走标准 exports——本清单只是显式的打包策略，不是解析兼容补丁。
 * （@shell/ui 不在内：它只被 renderer 消费，Vite 直接编译其源码。）
 */
const externalizeDeps = {
  exclude: [
    '@shell/app-runtime',
    '@shell/bridge',
    '@shell/devices',
    '@shell/kernel',
    '@shell/shared',
    '@shell/update',
    '@shell/window',
  ],
  include: [
    'electron-log',
    'electron-store',
    'extract-zip',
    'koffi',
    'ws',
    'zod',
  ],
}

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

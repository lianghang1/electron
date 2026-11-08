import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'

/** workspace 源码内联（包 exports 指向 .ts，运行时不认），三方包维持外置。 */
const externalizeDeps = {
  exclude: [
    '@shell/app-runtime',
    '@shell/bridge',
    '@shell/devices',
    '@shell/kernel',
    '@shell/shared',
    '@shell/ui',
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
      rollupOptions: {
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

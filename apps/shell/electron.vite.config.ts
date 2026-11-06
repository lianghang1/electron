import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./electron/main/index.ts', import.meta.url)),
          // 守护进程独立 bundle：utilityProcess fork 目标（DeviceHost.entryPath 指向它）
          'device-host': fileURLToPath(new URL('../../packages/devices/src/host/entry.ts', import.meta.url)),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./electron/preload/index.ts', import.meta.url)),
          // remote 形态的 JSAPI 受控桥（RemoteOpener 以 preload 注入）
          jsapi: fileURLToPath(new URL('../../packages/bridge/src/jsapi-preload.ts', import.meta.url)),
        },
      },
    },
  },
  renderer: {
    root: fileURLToPath(new URL('./src', import.meta.url)),
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
})

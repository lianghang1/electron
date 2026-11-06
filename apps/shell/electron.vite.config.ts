import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: fileURLToPath(new URL('./electron/main/index.ts', import.meta.url)) },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: fileURLToPath(new URL('./electron/preload/index.ts', import.meta.url)) },
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

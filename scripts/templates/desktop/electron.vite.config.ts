import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { createElectronViteConfig } from '@desktop/config/vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

export default createElectronViteConfig({
  main: {
    build: {
      rollupOptions: {
        // 设备守护进程独立 bundle：utilityProcess.fork 的入口（厂商 DLL 崩溃隔离）
        input: { 'device-host': fileURLToPath(new URL('electron/main/device-host.ts', import.meta.url)) },
      },
    },
  },
  renderer: {
    plugins: [vue(), UnoCSS()],
    server: {
      host: true,
      port: 51730,
    },
    resolve: {
      alias: {
        '@': path.join(process.cwd(), './src'),
      },
    },
  },
})

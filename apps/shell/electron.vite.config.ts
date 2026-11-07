import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'

/**
 * 外置规则（Rolldown 只接受 RegExp，不支持函数）：相对路径与 @shell/* 打进产物，
 * 其余（electron / node: 内建 / node_modules 三方包）走运行时解析——
 * @shell/* 的 exports 直指 .ts 源码，运行时按包解析会撞上
 * Node ESM 对 TS 的扩展名解析限制，必须打包期内联。
 */
const EXTERNAL_PATTERN = /^(?!\.{1,2}\/|\/|@shell\/)/

export default defineConfig({
  main: {
    build: {
      // 关闭默认的依赖外置：由 EXTERNAL_PATTERN 接管（@shell/* 须内联）
      externalizeDeps: false,
      rollupOptions: {
        external: [EXTERNAL_PATTERN],
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
      externalizeDeps: false,
      rollupOptions: {
        external: [EXTERNAL_PATTERN],
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

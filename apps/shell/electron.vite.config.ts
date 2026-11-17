/* eslint-disable node/prefer-global/process */
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { getPascalCaseRouteName, VueRouterAutoImports } from 'vue-router/unplugin'
import VueRouter from 'vue-router/vite'
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
    root: '.',
    server: { port: 51888 },
    build: {
      rollupOptions: {
        input: { index: resolve(process.cwd(), 'index.html') },
      },
    },
    plugins: [
      VueRouter({
        dts: 'src/types/typed-router.d.ts',
        extensions: ['.vue'],
        routesFolder: 'src/pages',
        exclude: ['src/pages/**/components/**'],
        getRouteName: getPascalCaseRouteName,
      }),
      vue(),
      Components({
        dts: 'src/types/components.d.ts',
        resolvers: [],
        dirs: ['src/components'],
        directoryAsNamespace: true,
        globalNamespaces: ['components', 'common'],
      }),
      AutoImport({
        dts: 'src/types/auto-imports.d.ts',
        resolvers: [],
        dirs: ['src/composables', 'src/styles'],
        imports: [
          'vue',
          {
            'vue-router/auto': ['useLink'],
          },
          VueRouterAutoImports,
        ],
      }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': join(process.cwd(), './src'),
        '@ui': join(process.cwd(), '../../packages/ui/src'),
      },
    },
  },
})

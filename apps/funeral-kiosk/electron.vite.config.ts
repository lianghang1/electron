import path from 'node:path'
import process from 'node:process'
import { createElectronViteConfig } from '@desktop/config/vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { loadEnv } from 'electron-vite'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { ArcoResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import { getPascalCaseRouteName, VueRouterAutoImports } from 'vue-router/unplugin'
import VueRouter from 'vue-router/vite'

export default createElectronViteConfig({
  renderer: ({ mode }) => {
    const env = loadEnv(mode)

    let API_BASE_URL = env.VITE_API_BASE_URL
    const enableProxy = !!env.VITE_API_PROXY_TARGET
    if (enableProxy) {
      API_BASE_URL = env.VITE_API_PROXY_TARGET
    }

    return {
      define: {
        __VITE_API_BASE_URL__: JSON.stringify(API_BASE_URL),
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
        vueJsx(),
        Components({
          dts: 'src/types/components.d.ts',
          resolvers: [
            ArcoResolver({
              importStyle: 'css',
              sideEffect: true,
            }),
          ],
          dirs: ['src/components', 'src/components-biz'],
          directoryAsNamespace: true,
          globalNamespaces: ['components', 'common'],
        }),
        AutoImport({
          dts: 'src/types/auto-imports.d.ts',
          resolvers: [
            ArcoResolver(),
          ],
          imports: [
            'vue',
            'pinia',
            '@vueuse/core',
            {
              from: '@fun-design/use',
              imports: [
                'useState',
              ],
            },
            VueRouterAutoImports,
            { 'vue-router/auto': ['useLink'] },
          ],
          dirs: [
            'src/hooks/**',
            '!src/hooks/**/_*/**',
            'src/store/**',
            '!src/store/**/_*/**',
            'src/constants/**',
          ],
        }),
        UnoCSS(),
      ],
      server: {
        host: true,
        port: 51730,
        proxy: enableProxy
          ? {
              [env.VITE_API_BASE_URL]: {
                target: env.VITE_API_PROXY_TARGET,
                changeOrigin: true,
                rewrite: path => path.replace(new RegExp(`^${env.VITE_API_BASE_URL}`), ''),
              },
            }
          : undefined,
      },
      resolve: {
        alias: {
          '@': path.join(process.cwd(), './src'),
        },
      },
    }
  },
})

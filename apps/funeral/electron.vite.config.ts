import vue from '@vitejs/plugin-vue'
// electron-vite 加载 config 时会 esbuild 打包并外部化所有 bare import（由 Node 直接执行，
// 无法运行 TS 源码包），因此工厂用相对路径源码引用，会被一并打进 config bundle。
import { createElectronViteConfig } from '../../packages/vite-config/src/index'

export default createElectronViteConfig({
  renderer: {
    plugins: [vue()],
  },
})

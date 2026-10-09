// 工厂经 tsdown 预构建为 JS（@desktop/config 的 dist），Node 可直接执行 bare import
import { createElectronViteConfig } from '@desktop/config/vite'
import vue from '@vitejs/plugin-vue'
import unocss from 'unocss/vite'

export default createElectronViteConfig({
  main: {
    build: {
      rollupOptions: {
        // ws 的可选 native 加速依赖：未安装属正常，运行时由 ws 内部 try/catch 兜底，external 避免打包期解析失败
        external: ['bufferutil', 'utf-8-validate'],
      },
    },
  },
  renderer: {
    plugins: [vue(), unocss()],
  },
})

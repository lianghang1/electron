// 工厂经 tsdown 预构建为 JS（@desktop/config 的 dist），Node 可直接执行 bare import
import { createElectronViteConfig } from '@desktop/config/vite'
import vue from '@vitejs/plugin-vue'
import unocss from 'unocss/vite'

export default createElectronViteConfig({
  renderer: {
    plugins: [vue(), unocss()],
  },
})

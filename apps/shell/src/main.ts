import { createApp } from 'vue'
import { ShellApp } from '@shell/ui'
import '@shell/ui/styles.css'

// Vue 挂载完成即撤启动层（内联 splash 见 index.html），并回传 T4 首帧打点
createApp(ShellApp).mount('#app')
requestAnimationFrame(() => {
  document.body.classList.add('ready')
  window.desktop?.markFirstPaint()
})

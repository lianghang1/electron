import { createApp } from 'vue'
import App from './App.vue'
import { createRouter } from './router'
import '@shell/ui/styles.css'

// 挂载前同步应用启动外观：preload 已写 :root，此处补 system 模式的动态跟随
const boot = window.shell?.shell.appearance()
if (boot) {
  bootstrapAppearance(boot.accent, boot.theme)
}

async function setupApp() {
  const app = createApp(App)
  await createRouter(app)
  app.mount('#app')
}

void setupApp()

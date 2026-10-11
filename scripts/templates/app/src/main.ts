import { createApp } from 'vue'
import App from './App.vue'
import { createDayJsPlugin } from './plugins/dayjs'
import { createRouter } from './router'
import { createStore } from './store'

import './styles/index.scss'
import 'virtual:uno.css'

async function bootstrap() {
  const app = createApp(App)

  createDayJsPlugin()

  createRouter(app)

  createStore(app)

  app.mount('#app')
}

bootstrap()

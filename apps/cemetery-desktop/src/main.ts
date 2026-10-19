import { mountPlatformApp } from '@desktop/ui'
import App from './App.vue'
import { createDayJsPlugin } from './plugins/dayjs'
import { createRouter } from './router'
import { createStore } from './store'

import './styles/index.scss'
import 'virtual:uno.css'

// 双形态入口：#/overlay hash 是浮层原生窗页面（OverlayApp），其余挂业务页面；
// router/store/dayjs 仅在业务页面分支装配（浮层窗不参与应用路由与状态）
mountPlatformApp(App, (app) => {
  createDayJsPlugin()
  createRouter(app)
  createStore(app)
})

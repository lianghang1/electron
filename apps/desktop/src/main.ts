import { createApp } from 'vue'
import App from './App.vue'
import OverlayApp from './overlay/OverlayApp.vue'
import './styles/tokens.css'
import 'virtual:uno.css'

// 同一 renderer 入口双形态：#/overlay 时本窗口是浮层原生窗的页面（右键菜单等），
// 其余情况是 Shell 框架本体
const isOverlay = window.location.hash === '#/overlay'
createApp(isOverlay ? OverlayApp : App).mount('#app')

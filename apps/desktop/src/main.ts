import { parseOverlayHash } from '@desktop/shared'
import { createApp } from 'vue'

import App from './App.vue'
import OverlayApp from './overlay/OverlayApp.vue'

import './styles/css/reset.css'
import './styles/css/transition.css'
import './styles/tokens.css'
import 'virtual:uno.css'

// 同一 renderer 入口双形态：#/overlay 开头的 hash 是浮层原生窗的页面（右键菜单等），
// 其余情况是 Shell 框架本体；浮层 hash 编解码单点在 shared overlay-contract
const isOverlay = parseOverlayHash(window.location.hash) !== null
createApp(isOverlay ? OverlayApp : App).mount('#app')

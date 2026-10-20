import { mountShellApp } from '@desktop/ui'

import 'virtual:uno.css'

// Shell 整体内置于 @desktop/ui（双形态：#/overlay hash 挂 OverlayApp，其余挂 Shell）；
// reset / transition / dt-* 令牌样式随 ShellApp 自包含引入
mountShellApp()

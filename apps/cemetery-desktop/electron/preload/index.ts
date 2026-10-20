import { exposeDesktop } from '@desktop/core/preload'

// 平台桥：无 App 业务通道；有业务通道时传白名单，如 exposeDesktop(['cemetery-desktop:query'])
exposeDesktop()

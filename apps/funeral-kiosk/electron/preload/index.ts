import { exposeDesktop } from '@desktop/core/preload'
import { funeralKioskDomain } from '../../shared/types/ipc'

// 业务通道白名单：invoke 通道由域通道表生成（剔除 push 事件通道），与 Main 侧注册同源
exposeDesktop({
  appChannels: Object.values(funeralKioskDomain.channels)
    .filter(channel => !funeralKioskDomain.eventChannels.has(channel)),
})

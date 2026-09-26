import type { HospitalIpc } from '../../src/types/ipc'
import { exposeDesktop } from '@desktop/core/preload'

// 业务通道白名单：与 Main 侧 createHandle<HospitalIpc>() 注册的通道一致
exposeDesktop({
  appChannels: ['hospital:config:get'] satisfies readonly (keyof HospitalIpc & string)[],
})

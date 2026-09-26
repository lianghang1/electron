import type { FhIpc } from '../../src/types/ipc'
import { exposeDesktop } from '@desktop/core/preload'

// 业务通道白名单：与 Main 侧 createHandle<FhIpc>() 注册的通道一致
exposeDesktop({
  appChannels: [
    'fh:config:get',
    'fh:order:query',
    'fh:pay:create',
    'fh:pay:status',
    'fh:invoice:list',
    'fh:invoice:issue',
  ] satisfies readonly (keyof FhIpc & string)[],
})

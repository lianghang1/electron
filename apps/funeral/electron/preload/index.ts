import type { FhIpc } from '../../src/types/ipc'
import { exposeDesktop } from '@desktop/core/preload'

// 业务通道白名单：与 Main 侧 createHandle<FhIpc>() 注册的通道一致
exposeDesktop({
  appChannels: [
    'fh:config:get',
    'fh:config:update',
    'fh:auth:verify',
    'fh:app:exit',
    'fh:qrcode:decode',
    'fh:payment:methods',
    'fh:payment:settlementInit',
    'fh:payment:settlement',
    'fh:payment:pending',
    'fh:payment:order',
    'fh:payment:close',
    'fh:business:certQuery',
    'fh:business:certificate',
    'fh:product:list',
    'fh:product:retail',
    'fh:invoice:list',
    'fh:report:print',
    'fh:report:pdf',
    'fh:schedule:hall',
    'fh:schedule:cremation',
  ] satisfies readonly (keyof FhIpc & string)[],
})

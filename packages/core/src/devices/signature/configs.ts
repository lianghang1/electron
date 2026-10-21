import type { SignDeviceConfig } from '@desktop/shared'
import { CAMSDK_WS_PAD } from './vendors/camsdk-pad'

/**
 * signature 出厂档案（代码即配置，与 capture/idcard 同构）：
 * 运行时编辑（UI setConfig）写穿 device-signature.json，启动时按 id 回注缺失项。
 * dll 档案 id 必须等于守护进程签名驱动名（见 host/run.ts）。
 */
export const BUILT_IN_SIGNATURE_CONFIGS: SignDeviceConfig[] = [
  {
    id: 'camsdk',
    brand: CAMSDK_WS_PAD.brand,
    displayName: CAMSDK_WS_PAD.displayName,
    transport: 'ws',
    ws: { url: CAMSDK_WS_PAD.url },
  },
  {
    id: 'hanvon',
    brand: '汉王',
    displayName: '汉王签名板（DLL 直连）',
    transport: 'dll',
  },
]

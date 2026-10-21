import type { IdcardDeviceConfig } from '@desktop/shared'
import { CAMSDK_WS_READER } from './vendors/camsdk-ws'

/**
 * idcard 出厂档案（代码即配置，与 capture 同构）：
 * 运行时编辑（UI setConfig）写穿 device-idcard.json，启动时按 id 回注缺失项。
 * dll 档案 id 必须等于守护进程驱动注册表驱动名（ID_DRIVERS，见 host/run.ts）。
 */
export const BUILT_IN_IDCARD_CONFIGS: IdcardDeviceConfig[] = [
  {
    id: 'camsdk',
    brand: CAMSDK_WS_READER.brand,
    displayName: CAMSDK_WS_READER.displayName,
    transport: 'ws',
    ws: { url: CAMSDK_WS_READER.url },
  },
  {
    id: 'huashi',
    brand: '华视',
    displayName: '华视身份证阅读器（DLL 直连）',
    transport: 'dll',
    dll: {},
  },
  {
    id: 'kemi',
    brand: '科密',
    displayName: '科密身份证阅读器（DLL 直连）',
    transport: 'dll',
    dll: {},
  },
]

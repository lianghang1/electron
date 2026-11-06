import type { IcReaderDeviceConfig } from '@shell/shared'

/**
 * iccard 出厂档案（代码即配置，与 capture/idcard 同构）：
 * 运行时编辑（UI setConfig）写穿 device-iccard.json，启动时按 id 回注缺失项。
 * dll 档案 id 必须等于守护进程驱动注册表驱动名（IC_DRIVERS，见 host/run.ts）。
 * ws 路线协议适配未接入：档案可管理，对应设备在测试页显示为「未接入」。
 */
export const BUILT_IN_ICCARD_CONFIGS: IcReaderDeviceConfig[] = [
  {
    id: 'decard',
    brand: '德卡',
    displayName: '德卡 IC 卡读卡器（DLL 直连）',
    transport: 'dll',
  },
]

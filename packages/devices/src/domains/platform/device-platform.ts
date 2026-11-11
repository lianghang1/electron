/** 设备层平台标识：三大主流平台 + 国产化 Linux 细分（UOS/麒麟等） */
export type DevicePlatformId = 'windows' | 'mac' | 'linux' | 'linux-cn'

/**
 * 平台能力面：设备探测据此产出「平台不支持」的设备状态（unavailable，note 说明原因），
 * 不抛错。厂商 SDK 的 OS 覆盖是商务问题（多数厂商仅 Windows），结构按平台分层，
 * 能跑多少取决于厂商；ws/http 通道天然跨平台，不受 native 约束。
 */
export interface DevicePlatform {
  readonly id: DevicePlatformId
  /** 本平台是否有原生库对接面（Windows DLL / mac dylib / linux so） */
  readonly nativeSupported: boolean
  /** 本平台是否支持 winspool 打印机能力探测（纸型/硬件默认值，仅 Windows） */
  readonly winspoolSupported: boolean
}

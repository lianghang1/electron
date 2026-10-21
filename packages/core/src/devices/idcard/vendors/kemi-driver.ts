import { HuashiDriver } from './huashi-driver'

/**
 * 科密证卡读卡器驱动 —— CVR 兼容贴牌（科密主流读卡器按 CVR-100 标准接口出品，
 * API 与华视 Termb 同序列：InitComm → Authenticate → Read_Content → GetPeople*U）。
 *
 * 复用华视驱动全部读卡流程，仅覆写品牌与 DLL 位置。
 * CVR 兼容为贴牌假设（未见科密官方手册），设备 note 已标注该状态；
 * DLL 约定路径 resources/devices/idcard/kemi/win64/，SDK 主 DLL 若不叫 Termb.dll 按实际名改 dllFile。
 */
export class KemiDriver extends HuashiDriver {
  override readonly brand = '科密'
  override readonly displayName = '科密 CVR 兼容证卡读卡器（USB，待真机验证）'
  override readonly dllFile = 'devices/idcard/kemi/win64/Termb.dll'
}

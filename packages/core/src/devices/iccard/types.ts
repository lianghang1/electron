import type { IcCardData, IcCardErrorCode, IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest, IdReaderDevice, IdReaderTransport } from '@desktop/shared'

export type { IcCardData, IcCardErrorCode, IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest, IdReaderDevice, IdReaderTransport }

/** 读卡适配器统一接口（IC 卡域）—— 新接入方式 = 实现本接口。失败抛 IcCardError（code 见 IcCardErrorCode） */
export interface IcCardAdapter {
  readonly transport: IdReaderTransport
  /** 仅枚举具备 IC 卡能力的读卡器（capabilities 区分是否支持写卡） */
  listReaders: () => Promise<IdReaderDevice[]>
  /** 读 M1 IC 卡（寻卡 → 防碰撞 → 选卡 → 密钥认证 → 读块） */
  readIc: (device: IdReaderDevice, req: IcCardReadRequest) => Promise<IcCardData>
  /** 写 M1 IC 卡单块（驱动未声明该能力时抛 ADAPTER_UNAVAILABLE） */
  writeIc: (device: IdReaderDevice, req: IcCardWriteRequest) => Promise<void>
  destroy?: () => void
}

/**
 * 品牌驱动统一低层接口（dll 路线，IC 卡域）—— "一个厂商 = 一个驱动类"。
 * 身份（brand/displayName）、DLL 出厂位置（dllFile）、硬件参数（port 等由实现自带）与
 * 行为（open/close + 按硬件能力实现的读写方法）全部内聚在驱动类里；适配器只做
 * 路由 + 生命周期 + 错误统一。读块为域基础能力（必选），写卡按硬件实现声明（可选），
 * 设备 capabilities 由注册表按已实现方法自动生成。
 */
export interface IcCardDriver {
  readonly brand: string
  readonly displayName: string
  /** DLL 相对宿主资源根的出厂位置（如 devices/decard/win64/dcrf32.dll） */
  readonly dllFile: string
  /** 同组设备互斥：驱动使用进程级全局资源时声明，service 据此合并设备锁 */
  readonly lockGroup?: string
  dllPresent: () => boolean
  open: () => void
  close: () => void
  /** M1 IC 卡读块（密钥认证 + 读块，域基础能力） */
  readIcCard: (req: IcCardReadRequest) => IcCardData
  /** M1 IC 卡写块（密钥认证 + 写块）；危险操作由驱动强制拒绝密钥控制块/厂商块 */
  writeIcCard?: (req: IcCardWriteRequest) => void
}

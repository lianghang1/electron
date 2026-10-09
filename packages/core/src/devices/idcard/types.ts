import type { IcCardData, IcCardReadRequest, IcCardWriteRequest, IcCardWriteResult, IcReaderResult, IdCardData, IdReaderDevice, IdReaderErrorCode, IdReaderResult, IdReaderTransport } from '@desktop/shared'

export type { IcCardData, IcCardReadRequest, IcCardWriteRequest, IcCardWriteResult, IcReaderResult, IdCardData, IdReaderDevice, IdReaderErrorCode, IdReaderResult, IdReaderTransport }

/** 读卡适配器统一接口 —— 新接入方式 = 实现本接口 */
export interface IdCardAdapter {
  readonly transport: IdReaderTransport
  listReaders: () => Promise<IdReaderDevice[]>
  /** 读身份证（驱动未声明该能力时适配器返回 ADAPTER_UNAVAILABLE） */
  read: (device: IdReaderDevice) => Promise<IdReaderResult>
  /** 读 M1 IC 卡（驱动未声明该能力时适配器返回 ADAPTER_UNAVAILABLE） */
  readIc: (device: IdReaderDevice, req: IcCardReadRequest) => Promise<IcReaderResult>
  /** 写 M1 IC 卡单块（驱动未声明该能力时适配器返回 ADAPTER_UNAVAILABLE） */
  writeIc: (device: IdReaderDevice, req: IcCardWriteRequest) => Promise<IcCardWriteResult>
  destroy?: () => void
}

/**
 * 品牌驱动统一低层接口（dll 路线）—— "一个厂商 = 一个驱动类"。
 * 身份（brand/displayName）、DLL 出厂位置（dllFile）、硬件参数（port 等由实现自带）与
 * 行为（open/close + 按硬件能力实现的读卡方法）全部内聚在驱动类里；适配器只做
 * 路由 + 生命周期 + 错误统一。能力按驱动实际硬件声明：身份证阅读器实现 readCard，
 * IC 读卡器实现 readIcCard，设备 capabilities 由适配器按已实现方法自动生成。
 */
export interface BrandDriver {
  readonly brand: string
  readonly displayName: string
  /** DLL 相对宿主资源根的出厂位置（如 devices/huashi/Termb.dll） */
  readonly dllFile: string
  /** 同组设备互斥：驱动使用进程级全局资源（如 chdir 切 cwd）时声明，service 据此合并设备锁 */
  readonly lockGroup?: string
  dllPresent: () => boolean
  open: () => void
  close: () => void
  /** 身份证读取能力（带 SAM 安全模组的阅读器才实现，如华视） */
  readCard?: () => IdCardData
  /** M1 IC 卡能力（密钥认证 + 读块，如德卡） */
  readIcCard?: (req: IcCardReadRequest) => IcCardData
  /** M1 IC 卡写入能力（密钥认证 + 写块，如德卡）；危险操作由驱动强制拒绝密钥控制块/厂商块 */
  writeIcCard?: (req: IcCardWriteRequest) => void
}

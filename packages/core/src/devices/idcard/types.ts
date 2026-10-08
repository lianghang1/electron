import type { IdCardData, IdReaderDevice, IdReaderErrorCode, IdReaderResult, IdReaderTransport } from '@desktop/shared'

export type { IdCardData, IdReaderDevice, IdReaderErrorCode, IdReaderResult, IdReaderTransport }

/** 读卡适配器统一接口 —— 新接入方式 = 实现本接口 */
export interface IdCardAdapter {
  readonly transport: IdReaderTransport
  listReaders: () => Promise<IdReaderDevice[]>
  read: (device: IdReaderDevice) => Promise<IdReaderResult>
  destroy?: () => void
}

/**
 * 品牌驱动统一低层接口（dll 路线）—— "一个厂商 = 一个驱动类"。
 * 身份（brand/displayName）、DLL 出厂位置（dllFile）、硬件参数（port 等由实现自带）与
 * 行为（open/readCard/close）全部内聚在驱动类里；适配器只做路由 + 生命周期 + 错误统一。
 */
export interface BrandDriver {
  readonly brand: string
  readonly displayName: string
  /** DLL 相对宿主资源根的出厂位置（如 devices/huashi/Termb.dll） */
  readonly dllFile: string
  dllPresent: () => boolean
  open: () => void
  readCard: () => IdCardData
  close: () => void
}

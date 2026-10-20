import type { IdCardData, IdReaderDevice, IdReaderErrorCode, IdReaderTransport } from '@desktop/shared'

export type { IdCardData, IdReaderDevice, IdReaderErrorCode, IdReaderTransport }

/** 读卡适配器统一接口（身份证域）—— 新接入方式 = 实现本接口。失败抛 IdCardError（code 见 IdReaderErrorCode） */
export interface IdCardAdapter {
  readonly transport: IdReaderTransport
  /** 仅枚举具备身份证能力的读卡器 */
  listReaders: () => Promise<IdReaderDevice[]>
  /** 读身份证（打开 → 认证 → 读取 → 关闭全程锁定） */
  read: (device: IdReaderDevice) => Promise<IdCardData>
  destroy?: () => void
}

/**
 * 品牌驱动统一低层接口（dll 路线，身份证域）—— "一个厂商 = 一个驱动类"。
 * 身份（brand/displayName）、DLL 出厂位置（dllFile）、硬件参数（port 等由实现自带）与
 * 行为（open/close + readCard）全部内聚在驱动类里；适配器只做路由 + 生命周期 + 错误统一。
 */
export interface IdCardDriver {
  readonly brand: string
  readonly displayName: string
  /** DLL 相对宿主资源根的出厂位置（如 devices/huashi/win64/Termb.dll） */
  readonly dllFile: string
  /** 同组设备互斥：驱动使用进程级全局资源（如 chdir 切 cwd）时声明，service 据此合并设备锁 */
  readonly lockGroup?: string
  dllPresent: () => boolean
  open: () => void
  close: () => void
  /** 身份证读取（带 SAM 安全模组的阅读器，如华视；CVR 兼容贴牌驱动继承复用） */
  readCard: () => IdCardData
}

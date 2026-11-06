import type { IdcardConfig, IdcardDeviceOverrides } from '@shell/shared'
import type { Logger } from '@shell/kernel/logger'
import type { DeviceHost } from '../host/device-host'
import type { IdCardData, IdReaderDevice } from './types'
import { IdCardService } from './service'

export interface IdCardSystemOptions {
  /** 设备资源根（DLL 等 SDK 资源的基准目录，宿主解析开发/打包差异） */
  resourcesRoot: string
  /** 设备守护进程（DLL 的 koffi 调用崩溃隔离在 host 进程） */
  host: DeviceHost
  logger: Logger
}

export interface IdCardSystem {
  listReaders: () => Promise<IdReaderDevice[]>
  /** 读身份证（寻卡认证读取全程锁定）；失败抛 IdCardError */
  read: (req: { deviceId: string }) => Promise<IdCardData>
  /** 设备档案（ws/dll 双路线）管理：读全量 / 按档案 id 白名单覆盖（IPC 层 sanitize 后落盘） */
  getConfig: () => IdcardConfig
  setConfig: (id: string, overrides: IdcardDeviceOverrides) => IdcardConfig
  destroy: () => void
}

/** 创建身份证阅读系统（与 print/capture/iccard 系统同构，idcard 域通道由 core/src/ipc/idcard.ts 注册） */
export function createIdCardSystem(options: IdCardSystemOptions): IdCardSystem {
  const service = new IdCardService(options.resourcesRoot, options.host, options.logger)
  return {
    listReaders: () => service.listReaders(),
    read: req => service.read(req),
    getConfig: () => service.getConfig(),
    setConfig: (id, overrides) => service.setConfig(id, overrides),
    destroy: () => service.destroy(),
  }
}

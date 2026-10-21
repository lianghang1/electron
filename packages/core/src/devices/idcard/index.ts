import type { IdcardConfig, IdcardDeviceConfig } from '@desktop/shared'
import type { Logger } from '../../logger/logger'
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
  /** 设备档案（ws 路线）管理：读全量 / 按档案 id upsert / 按 id 删除（IPC 层 sanitize 后落盘） */
  getConfig: () => IdcardConfig
  setConfig: (next: IdcardDeviceConfig) => IdcardConfig
  removeConfig: (id: string) => boolean
  destroy: () => void
}

/** 创建身份证阅读系统（与 print/capture/iccard 系统同构，idcard 域通道由 core/src/ipc/idcard.ts 注册） */
export function createIdCardSystem(options: IdCardSystemOptions): IdCardSystem {
  const service = new IdCardService(options.resourcesRoot, options.host, options.logger)
  return {
    listReaders: () => service.listReaders(),
    read: req => service.read(req),
    getConfig: () => service.getConfig(),
    setConfig: next => service.setConfig(next),
    removeConfig: id => service.removeConfig(id),
    destroy: () => service.destroy(),
  }
}

import type { Logger } from '../../logger/logger'
import type { IdReaderDevice, ReadResult } from './types'
import { ipcMain } from 'electron'
import { IdCardService } from './service'

export interface IdCardSystemOptions {
  /** 设备资源根（DLL 等 SDK 资源的基准目录，宿主解析开发/打包差异） */
  resourcesRoot: string
  logger: Logger
}

export interface IdCardSystem {
  listReaders: () => Promise<IdReaderDevice[]>
  read: (req: { deviceId: string }) => Promise<ReadResult>
  destroy: () => void
}

/** 创建证卡读取系统（与 createPrintSystem/createCaptureSystem 同构） */
export function createIdCardSystem(options: IdCardSystemOptions): IdCardSystem {
  const service = new IdCardService(options.resourcesRoot, options.logger)
  return {
    listReaders: () => service.listReaders(),
    read: req => service.read(req),
    destroy: () => service.destroy(),
  }
}

/** 注册 idcard:* IPC 通道 */
export function registerIdCardIpc(system: IdCardSystem): void {
  ipcMain.handle('idcard:list', () => system.listReaders())
  ipcMain.handle('idcard:read', (_e, req: { deviceId: string }) => system.read(req))
}

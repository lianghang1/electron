import type { Logger } from '../../logger/logger'
import type { IdReaderDevice, IdReaderResult } from './types'
import { IdCardService } from './service'

export interface IdCardSystemOptions {
  /** 设备资源根（DLL 等 SDK 资源的基准目录，宿主解析开发/打包差异） */
  resourcesRoot: string
  logger: Logger
  /** 注册内置 mock 读卡器（stub）：缺省关闭，dev 环境或明确要求时开启 */
  mock?: boolean
}

export interface IdCardSystem {
  listReaders: () => Promise<IdReaderDevice[]>
  read: (req: { deviceId: string }) => Promise<IdReaderResult>
  destroy: () => void
}

/** 创建证卡读取系统（与 print/capture 系统同构，device 域通道由 core/src/ipc/device.ts 注册） */
export function createIdCardSystem(options: IdCardSystemOptions): IdCardSystem {
  const service = new IdCardService(options.resourcesRoot, options.logger, options.mock)
  return {
    listReaders: () => service.listReaders(),
    read: req => service.read(req),
    destroy: () => service.destroy(),
  }
}

import type { Logger } from '../../logger/logger'
import type { DeviceHost } from '../host/device-host'
import type { IcCardData, IcCardReadRequest, IcCardWriteRequest, IdCardData, IdReaderDevice } from './types'
import { IdCardService } from './service'

export interface IdCardSystemOptions {
  /** 设备资源根（DLL 等 SDK 资源的基准目录，宿主解析开发/打包差异） */
  resourcesRoot: string
  /** 设备守护进程（DLL 的 koffi 调用崩溃隔离在 host 进程） */
  host: DeviceHost
  logger: Logger
  /** 注册内置 mock 读卡器（stub）：缺省关闭，dev 环境或明确要求时开启 */
  mock?: boolean
}

export interface IdCardSystem {
  listReaders: () => Promise<IdReaderDevice[]>
  /** 读身份证（寻卡认证读取全程锁定，同设备与 readIc 串行化）；失败抛 IdCardError */
  read: (req: { deviceId: string }) => Promise<IdCardData>
  /** 读 M1 IC 卡（密钥认证读块，与 read 同设备串行化）；失败抛 IdCardError */
  readIc: (req: IcCardReadRequest & { deviceId: string }) => Promise<IcCardData>
  /** 写 M1 IC 卡单块（覆盖写，驱动强制拒绝密钥控制块/厂商块；与读同设备串行化） */
  writeIc: (req: IcCardWriteRequest & { deviceId: string }) => Promise<void>
  destroy: () => void
}

/** 创建证卡读取系统（与 print/capture 系统同构，device 域通道由 core/src/ipc/device.ts 注册） */
export function createIdCardSystem(options: IdCardSystemOptions): IdCardSystem {
  const service = new IdCardService(options.resourcesRoot, options.host, options.logger, options.mock)
  return {
    listReaders: () => service.listReaders(),
    read: req => service.read(req),
    readIc: req => service.readIc(req),
    writeIc: req => service.writeIc(req),
    destroy: () => service.destroy(),
  }
}

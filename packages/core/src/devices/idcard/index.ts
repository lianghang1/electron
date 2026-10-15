import type { Logger } from '../../logger/logger'
import type { DeviceHost } from '../host/device-host'
import type { IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest, IdCardData, IdReaderDevice } from './types'
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
  /** 读身份证（寻卡认证读取全程锁定，同设备与 readIc 串行化）；失败抛 IdCardError */
  read: (req: { deviceId: string }) => Promise<IdCardData>
  /** 读 M1 IC 卡一个扇区（返回原始块数据 + 字符串组 texts，与 writeIcTexts 互逆；与读同设备串行化） */
  readIc: (req: IcCardReadRequest & { deviceId: string }) => Promise<IcCardReadResult>
  /** 写 M1 IC 卡单块（覆盖写，驱动强制拒绝密钥控制块/厂商块；与读同设备串行化） */
  writeIc: (req: IcCardWriteRequest & { deviceId: string }) => Promise<void>
  /** 写 M1 IC 卡扇区字符串组（未占用数据块清零，整扇区同锁写入；与读同设备串行化） */
  writeIcTexts: (req: IcCardTextsWriteRequest & { deviceId: string }) => Promise<void>
  destroy: () => void
}

/** 创建证卡读取系统（与 print/capture 系统同构，device 域通道由 core/src/ipc/device.ts 注册） */
export function createIdCardSystem(options: IdCardSystemOptions): IdCardSystem {
  const service = new IdCardService(options.resourcesRoot, options.host, options.logger)
  return {
    listReaders: () => service.listReaders(),
    read: req => service.read(req),
    readIc: req => service.readIc(req),
    writeIc: req => service.writeIc(req),
    writeIcTexts: req => service.writeIcTexts(req),
    destroy: () => service.destroy(),
  }
}

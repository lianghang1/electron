import type { IccardConfig, IcReaderDeviceConfig } from '@desktop/shared'
import type { Logger } from '../../logger/logger'
import type { DeviceHost } from '../host/device-host'
import type { IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest, IdReaderDevice } from './types'
import { IcCardService } from './service'

export interface IcCardSystemOptions {
  /** 设备资源根（DLL 等 SDK 资源的基准目录，宿主解析开发/打包差异） */
  resourcesRoot: string
  /** 设备守护进程（DLL 的 koffi 调用崩溃隔离在 host 进程） */
  host: DeviceHost
  logger: Logger
}

export interface IcCardSystem {
  listReaders: () => Promise<IdReaderDevice[]>
  /** 读 M1 IC 卡一个扇区（返回原始块数据 + 字符串组 texts，与 writeIcTexts 互逆；与读同设备串行化） */
  readIc: (req: IcCardReadRequest & { deviceId: string }) => Promise<IcCardReadResult>
  /** 写 M1 IC 卡单块（覆盖写，驱动强制拒绝密钥控制块/厂商块；与读同设备串行化） */
  writeIc: (req: IcCardWriteRequest & { deviceId: string }) => Promise<void>
  /** 写 M1 IC 卡扇区字符串组（未占用数据块清零，整扇区同锁写入；与读同设备串行化） */
  writeIcTexts: (req: IcCardTextsWriteRequest & { deviceId: string }) => Promise<void>
  /** 设备档案（ws 路线）管理：读全量 / 按档案 id upsert / 按 id 删除（IPC 层 sanitize 后落盘） */
  getConfig: () => IccardConfig
  setConfig: (next: IcReaderDeviceConfig) => IccardConfig
  removeConfig: (id: string) => boolean
  destroy: () => void
}

/** 创建 M1 IC 卡读写系统（与 print/capture/idcard 系统同构，iccard 域通道由 core/src/ipc/iccard.ts 注册） */
export function createIcCardSystem(options: IcCardSystemOptions): IcCardSystem {
  const service = new IcCardService(options.resourcesRoot, options.host, options.logger)
  return {
    listReaders: () => service.listReaders(),
    readIc: req => service.readIc(req),
    writeIc: req => service.writeIc(req),
    writeIcTexts: req => service.writeIcTexts(req),
    getConfig: () => service.getConfig(),
    setConfig: next => service.setConfig(next),
    removeConfig: id => service.removeConfig(id),
    destroy: () => service.destroy(),
  }
}

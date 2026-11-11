import type { Logger } from '@shell/kernel/logger'
import type { IccardConfig, IccardDeviceOverrides } from '@shell/shared'
import type { DeviceHost } from '../../host/device-host'
import type { IcCardReadRequest, IcCardReadResult, IcCardTextsWriteRequest, IcCardWriteRequest, IcReaderDevice } from './device-contracts'
import { IcCardService } from './service'

export interface IcCardSystemOptions {
  /** 设备资源根（DLL 等 SDK 资源的基准目录，宿主解析开发/打包差异） */
  resourcesRoot: string
  /** 设备守护进程（DLL 的 koffi 调用崩溃隔离在 host 进程） */
  host: DeviceHost
  logger: Logger
}

export interface IcCardSystem {
  listDevices: () => Promise<IcReaderDevice[]>
  /** 读 M1 IC 卡一个扇区（返回原始块数据 + 字符串组 texts，与 writeIcTexts 互逆；与读同设备串行化） */
  readSector: (req: IcCardReadRequest & { deviceId: string }) => Promise<IcCardReadResult>
  /** 写 M1 IC 卡单块（覆盖写，驱动强制拒绝密钥控制块/厂商块；与读同设备串行化） */
  writeSector: (req: IcCardWriteRequest & { deviceId: string }) => Promise<void>
  /** 写 M1 IC 卡扇区字符串组（未占用数据块清零，整扇区同锁写入；与读同设备串行化） */
  writeTextBlocks: (req: IcCardTextsWriteRequest & { deviceId: string }) => Promise<void>
  /** 设备档案（ws/dll 双路线）管理：读全量 / 按档案 id 白名单覆盖（IPC 层 sanitize 后落盘） */
  getConfig: () => IccardConfig
  setConfig: (id: string, overrides: IccardDeviceOverrides) => IccardConfig
  destroy: () => void
}

/** 创建 M1 IC 卡读写系统（与 print/capture/idcard 系统同构，iccard 域通道由 core/src/ipc/iccard.ts 注册） */
export function createIcCardSystem(options: IcCardSystemOptions): IcCardSystem {
  const service = new IcCardService(options.resourcesRoot, options.host, options.logger)
  return {
    listDevices: () => service.listDevices(),
    readSector: req => service.readSector(req),
    writeSector: req => service.writeSector(req),
    writeTextBlocks: req => service.writeTextBlocks(req),
    getConfig: () => service.getConfig(),
    setConfig: (id, overrides) => service.setConfig(id, overrides),
    destroy: () => service.destroy(),
  }
}

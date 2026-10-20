import type { Logger } from '../../logger/logger'
import type { DeviceHost } from '../host/device-host'
import type { SignDevice, SignSessionResult, SignStartResult, SignStrokePoint } from './types'
import { SignatureService } from './service'

export interface SignatureSystemOptions {
  /** 设备资源根（DLL 等 SDK 资源的基准目录，宿主解析开发/打包差异） */
  resourcesRoot: string
  /** 设备守护进程（DLL 探测的 koffi 调用崩溃隔离在 host 进程，主进程零 native 依赖） */
  host: DeviceHost
  logger: Logger
}

export interface SignatureSystem {
  listDevices: () => Promise<SignDevice[]>
  /** 开始签名会话；onStroke = 发起方的实时笔迹回调（ipc 层绑定 webContents.send 推送） */
  start: (req: { deviceId?: string } | undefined, onStroke: (point: SignStrokePoint) => void) => Promise<SignStartResult>
  /** 结束会话并回收完整笔迹点集（签名图由渲染层自绘） */
  stop: () => Promise<SignSessionResult>
  clear: () => Promise<void>
  cancel: () => Promise<void>
  destroy: () => void
}

/** 创建手写签名系统（与 idcard/capture 系统同构，signature 域通道由 core/src/ipc/signature.ts 注册） */
export function createSignatureSystem(options: SignatureSystemOptions): SignatureSystem {
  const service = new SignatureService(options.host, options.resourcesRoot, options.logger)
  return {
    listDevices: () => service.listDevices(),
    start: (req, onStroke) => service.start(req, onStroke),
    stop: () => service.stop(),
    clear: () => service.clear(),
    cancel: () => service.cancel(),
    destroy: () => service.destroy(),
  }
}

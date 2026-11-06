import type { HostError } from './protocol'

/** 守护进程级错误码：host 进程自身生命周期问题（区别于设备操作错误码） */
export type DeviceHostErrorCode = 'DEVICE_HOST_CRASHED' | 'DEVICE_HOST_TIMEOUT' | 'DEVICE_HOST_UNAVAILABLE'

/** 守护进程生命周期错误：崩溃自愈 / 超时 / 未装配时抛出，code 可穿越 IPC 供渲染层分支 */
export class DeviceHostError extends Error {
  readonly code: DeviceHostErrorCode
  readonly detail?: unknown

  constructor(code: DeviceHostErrorCode, message: string, detail?: unknown) {
    super(message)
    this.name = 'DeviceHostError'
    this.code = code
    this.detail = detail
  }
}

/** 守护进程响应错误还原：保留远端 name/code/detail（设备驱动错误按原码抛回调用链） */
export class HostRemoteError extends Error {
  readonly code: string
  readonly detail?: unknown

  constructor(error: HostError) {
    super(error.message)
    this.name = error.name
    this.code = error.code
    this.detail = error.detail
  }
}

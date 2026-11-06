import type { SignDevice, SignDeviceTransport, SignErrorCode, SignSessionResult, SignStartResult, SignStroke, SignStrokePoint } from '@shell/shared'

export type { SignDevice, SignDeviceTransport, SignErrorCode, SignSessionResult, SignStartResult, SignStroke, SignStrokePoint }

/**
 * 签名适配器统一接口 —— 会话式：start 建会话（笔迹点经 onStroke 逐点实时上报），
 * stop 一次性回收完整笔迹；clear 清空笔迹保持会话；cancel 作废会话。
 * 失败统一抛 SignatureError（code 见 SignErrorCode），由 service 归一后向上传递。
 */
export interface SignAdapter {
  readonly transport: SignDeviceTransport
  listDevices: () => Promise<SignDevice[]>
  /** 开始会话（同一适配器同时只允许一个会话，重复开始抛 SESSION_ACTIVE） */
  start: (device: SignDevice, onStroke: (point: SignStrokePoint) => void) => Promise<SignStartResult>
  /** 结束会话并回收完整笔迹点集 */
  stop: () => Promise<SignSessionResult>
  /** 清空当前笔迹（会话保持，可继续书写） */
  clear: () => Promise<void>
  /** 取消会话（笔迹作废） */
  cancel: () => Promise<void>
  destroy?: () => void
}

import type { SignActionResult, SignDevice, SignSessionResult, SignStartResult, SignStrokePoint } from '../../devices/signature'
import { invoke, push } from '../../../domain'

/**
 * 设备域 · 手写签名切片（手写板 / 签名屏）。
 * 会话式交互：startSign 建会话 → 笔迹点经 onStroke 实时推送（渲染层即时绘制）→
 * stopSign 回收完整笔迹点集（签名图由渲染层自绘，设备侧不产位图）。
 */
export const signatureDomainDefs = {
  /** 列出全部签名设备（失败经 error 字段回传，永不 reject） */
  listDevices: invoke<() => Promise<{ ok: true, devices: SignDevice[] } | { ok: false, error: { code: string, message: string } }>>(),
  /** 开始签名会话（deviceId 缺省自动选第一个就绪设备；重复开始返回 SESSION_ACTIVE） */
  startSign: invoke<(req?: { deviceId?: string }) => SignStartResult>(),
  /** 结束会话并回收完整笔迹点集（无会话返回 SESSION_NOT_ACTIVE） */
  stopSign: invoke<() => SignSessionResult>(),
  /** 清空当前笔迹（会话保持，可继续书写） */
  clearSign: invoke<() => SignActionResult>(),
  /** 取消会话（笔迹作废，等同未签名） */
  cancelSign: invoke<() => SignActionResult>(),
  /** 笔迹采样点实时推送（仅推给发起会话的窗口） */
  onStroke: push<[point: SignStrokePoint]>(),
}

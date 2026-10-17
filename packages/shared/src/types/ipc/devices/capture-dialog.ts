import type { CaptureCameraInfo, CaptureDevice, CaptureDialogSession, CaptureResult } from '../../devices/capture'
import { invoke, push } from '../../../domain'

/**
 * captureDialog 域通道定义 —— 拍摄浮层窗专属（仅拍摄窗挂载，域对象见 devices/index.ts）。
 * 浮层内预览 / 拍摄 / 确认在会话上下文内闭环，结果随发起方 openCaptureDialog 的 Promise 交付；
 * 与 capture 域（设备能力 + 发起方通道）分离，浮层窗不持有设备写入面（upsertProfile / 发起新会话）。
 * 文件与 core/src/ipc/capture-dialog.ts（注册实现）一一对应。
 */
export const captureDialogDomainDefs = {
  /** 浮层页 mounted 后拉取当前会话（对账 Main 推送早于订阅的竞态） */
  sync: invoke<() => CaptureDialogSession | null>(),
  /** 浮层内设备发现：选设备与枚举分辨率（与 capture.listDevices / listCameras 同数据源） */
  listDevices: invoke<() => Promise<CaptureDevice[]>>(),
  listCameras: invoke<(deviceId: string) => Promise<CaptureCameraInfo[]>>(),
  /** 会话内开启预览（帧经 capture:onPreviewFrame 推回浮层窗自身） */
  startPreview: invoke<(deviceId: string, opts?: { resolutionNum?: number }) => Promise<void>>(),
  /** 会话内关闭预览 */
  stopPreview: invoke<() => Promise<void>>(),
  /**
   * 会话内拍一张。UVC 路线传 dataUrl（浮层抽帧，meta 可带成片像素）落盘；
   * ws/SDK 路线不传，由 Main 按会话设备走 capture 会话内拍照。结果由浮层 UI 收集，确认时统一回传。
   */
  capture: invoke<(opts?: { dataUrl?: string, meta?: Record<string, unknown> }) => Promise<CaptureResult>>(),
  /** 确认回传（非空结果数组，作为 openCaptureDialog 的 resolve 值，Main 随即关闭浮层） */
  confirm: invoke<(results: CaptureResult[]) => Promise<void>>(),
  /** 浮层页取消（× / ESC）→ 会话收尾（回收预览 / 隐藏拍摄窗 / 通知发起 tab） */
  dismiss: invoke<() => void>(),

  // ---- Main → Renderer 推送 ----
  /** 拍摄浮层会话变化推送（拍摄窗数据源，null = 已关闭） */
  captureUpdated: push<[CaptureDialogSession | null]>(),
}

import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke, push } from '../contract'

/** 拍摄浮层发起请求（发起方身份主进程从账本反查，入参只描述业务意图） */
export interface CaptureDialogOpenInput {
  deviceId?: string
  deviceLabel?: string
  title?: string
  resolutionNum?: number
  maxCount?: number
  format?: 'jpg' | 'png' | 'bmp'
}

/** 帧推送载荷：设备 id + JPEG base64（浮层预览用） */
export interface CaptureFramePayload {
  deviceId: string
  base64: string
}

/** 预览启动请求（多参数收对象） */
export interface CapturePreviewInput {
  deviceId: string
  resolutionNum?: number
}

/**
 * 浮层内拍摄请求：SDK 路线显式携带浮层当前选中设备/档位（会话预选只是 open 时刻
 * 快照，浮层内切换必须生效）；UVC 路线传 dataUrl（渲染层抽帧，meta 随结果透传）。
 */
export interface CaptureSnapInput {
  /** UVC 路线：渲染层抽帧的全尺寸 dataURL（落盘走平台目录，渲染层不可指定） */
  dataUrl?: string
  meta?: Record<string, unknown>
  /** SDK 路线：浮层当前选中设备（缺省回落会话预选） */
  deviceId?: string
  /** SDK 路线：分辨率档位序号（浮层档位下拉当前值；缺省回落会话预选） */
  resolutionNum?: number
}

/**
 * 拍摄浮层会话域契约：发起方开/关会话，浮层窗内预览与结果回传。
 * 浮层是独立功能面：设备枚举 / 摄像头档位由浮层自取，不依赖发起方状态。
 * push `frame`（channel `captureDialog:frame`）由壳层拍摄编排直推浮层窗 webContents。
 */
export const captureDialogDomain = defineIpcDomain('captureDialog', {
  open: invoke<(input: CaptureDialogOpenInput) => unknown>(),
  close: invoke<() => void>(),
  listDevices: invoke<() => unknown>(),
  listDeviceCameras: invoke<(deviceId: string) => unknown>(),
  startPreview: invoke<(input: CapturePreviewInput) => unknown>(),
  stopPreview: invoke<() => void>(),
  snap: invoke<(opts?: CaptureSnapInput) => unknown>(),
  confirm: invoke<(results: unknown[]) => unknown>(),
  frame: push<CaptureFramePayload[]>(),
}) satisfies IpcDomainValue<'captureDialog', IpcDefs>

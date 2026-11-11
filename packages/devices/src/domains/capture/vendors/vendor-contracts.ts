import type { CaptureCameraInfo, CaptureDeviceConfig, ChannelCaptureRequest } from '@shell/shared'

/** ws 接入端点（设备配置 ws 段：厂商模块统一消费的连接参数） */
export type WsEndpoint = NonNullable<CaptureDeviceConfig['ws']>

/**
 * 常驻预览会话句柄（厂商模块实现）：open 后 onFrame 持续收预览帧，
 * capture 在会话内拍照（摄像头不重开），close 释放摄像头与连接。
 */
export interface CapturePreviewSession {
  /** 会话是否存活（已开启且未关闭；掉线后自动失效） */
  readonly active: boolean
  /** 开启会话并等首帧（首帧 = 出图就绪标志） */
  open: () => Promise<void>
  /** 会话内拍照，返回图片 base64 */
  capture: () => Promise<string>
  /** 释放摄像头与连接（best-effort：连接已死也要把会话标记关闭） */
  close: () => void
}

/**
 * capture 厂商模块契约：入参出参全是域统一类型，厂商差异止步于模块内部。
 * 新厂商接入 = 本目录加一个模块文件 + registry 注册一行 + 配置条目 protocol 填 vendorId。
 */
export interface CaptureVendor {
  readonly vendorId: string
  /** 一次性拍照（自建短连接 → 采集 → 释放），返回图片 base64 */
  captureOnce: (endpoint: WsEndpoint, req: Pick<ChannelCaptureRequest, 'resolutionNum'>) => Promise<string>
  /** 枚举设备下的摄像头与分辨率（可选能力：短连接，不占用摄像头） */
  listCameras?: (endpoint: WsEndpoint) => Promise<CaptureCameraInfo[]>
  /** 创建常驻预览会话（可选能力）：构造后由调用方 open */
  createPreviewSession?: (endpoint: WsEndpoint, opts: { resolutionNum?: number }, onFrame: (base64: string) => void) => CapturePreviewSession
}

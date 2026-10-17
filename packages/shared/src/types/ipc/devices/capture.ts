import type { CaptureCameraInfo, CaptureDevice, CaptureDeviceProfile, CaptureDialogRequest, CaptureRequest, CaptureResult } from '../../devices/capture'
import { invoke, push } from '../../../domain'

/**
 * capture 域契约 —— 图像采集（高拍仪/扫描仪/摄像头，多品牌多接入方式）。
 * 失败统一 reject（IpcRemoteError，code 见 CaptureErrorCode），渲染层 try/catch 按错误码分支。
 */
export const captureDomainDefs = {
  /** 设备列表：各适配器上报后合并（含连通性探测状态） */
  listDevices: invoke<() => Promise<CaptureDevice[]>>(),
  /** 设备档案列表（出厂 + 运行时编辑） */
  getProfiles: invoke<() => Promise<CaptureDeviceProfile[]>>(),
  /** 运行时编辑设备档案（upsert，热重建适配器） */
  upsertProfile: invoke<(profile: CaptureDeviceProfile) => void>(),
  /** 采集一张：deviceId 路由到对应适配器；同一设备串行化；预览开启时走会话内拍照 */
  capture: invoke<(req: CaptureRequest) => Promise<CaptureResult>>(),
  /** UVC 路线（渲染层 getUserMedia）拍到的 dataURL 落盘为图片文件，返回绝对路径 */
  saveDataUrl: invoke<(dataUrl: string, ext?: 'jpg' | 'png') => Promise<string>>(),
  /** 开启实时预览（ws/camsdk 高拍仪）：预览帧经 onPreviewFrame 推给发起窗口，会话保持供 capture 拍照 */
  startPreview: invoke<(deviceId: string, opts?: { resolutionNum?: number }) => Promise<void>>(),
  /** 关闭实时预览 */
  stopPreview: invoke<(deviceId: string) => Promise<void>>(),
  /** 枚举设备下的摄像头与分辨率（ws/camsdk GetCameraInfo；不占用摄像头） */
  listCameras: invoke<(deviceId: string) => Promise<CaptureCameraInfo[]>>(),
  /** 实时预览帧推送（JPEG base64；仅推给发起预览的窗口） */
  onPreviewFrame: push<[frame: { deviceId: string, base64: string }]>(),

  // ---- 内置 UI 拍摄浮层（发起方通道；浮层窗内操作见 captureDialog 域） ----
  /**
   * 发起拍摄浮层：Main 打开第四类原生浮层窗（全局互斥，占用中 reject DEVICE_BUSY）。
   * Promise 在浮层结束时交付：确认回传 resolve 结果数组，用户取消/未拍 resolve 空数组，
   * 会话异常 reject——结果归属与并发随 invoke Promise 一一对应，无需事件配对。
   */
  openCaptureDialog: invoke<(req: CaptureDialogRequest) => Promise<CaptureResult[]>>(),
  /** 页面主动取消浮层（仅发起 tab 可调）：Promise 以空结果收尾 */
  closeCaptureDialog: invoke<() => Promise<void>>(),
}

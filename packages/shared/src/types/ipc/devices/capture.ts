import type { CaptureCameraInfo, CaptureDevice, CaptureDeviceProfile, CaptureRequest, CaptureResult } from '../../devices/capture'
import { invoke, push } from '../../../domain'

/**
 * capture 域契约 —— 图像采集（高拍仪/扫描仪/摄像头，多品牌多接入方式）。
 * 永不 reject，失败以 CaptureResult.error 字段回传。
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
  startPreview: invoke<(deviceId: string, opts?: { resolutionNum?: number }) => Promise<CaptureResult>>(),
  /** 关闭实时预览 */
  stopPreview: invoke<(deviceId: string) => Promise<CaptureResult>>(),
  /** 枚举设备下的摄像头与分辨率（ws/camsdk GetCameraInfo；不占用摄像头） */
  listCameras: invoke<(deviceId: string) => Promise<CaptureCameraInfo[]>>(),
  /** 实时预览帧推送（JPEG base64；仅推给发起预览的窗口） */
  onPreviewFrame: push<[frame: { deviceId: string, base64: string }]>(),
}

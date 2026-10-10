import type { CaptureCameraInfo, CaptureDevice, CaptureDeviceProfile, CaptureLogFn, CaptureRequest, CaptureResult } from '@desktop/shared'
import type { Logger } from '../../logger/logger'
import { CaptureService } from './service'

export { BUILT_IN_CAPTURE_PROFILES } from './profiles'

export interface CaptureSystem {
  listDevices: () => Promise<CaptureDevice[]>
  getProfiles: () => Promise<CaptureDeviceProfile[]>
  upsertProfile: (profile: CaptureDeviceProfile) => void
  capture: (req: CaptureRequest) => Promise<CaptureResult>
  /** UVC 路线（渲染层 getUserMedia）拍到的 dataURL 落盘为图片文件 */
  saveDataUrl: (dataUrl: string, ext?: 'jpg' | 'png') => Promise<string>
  /** 实时预览（ws/camsdk）：预览帧经 onFrame 回调（由 IPC 层转发发起窗口）；失败抛 CaptureError */
  startPreview: (deviceId: string, onFrame: (base64: string) => void, opts?: { resolutionNum?: number }) => Promise<void>
  stopPreview: (deviceId: string) => Promise<void>
  /** 枚举设备下的摄像头与分辨率（ws/camsdk GetCameraInfo） */
  listCameras: (deviceId: string) => Promise<CaptureCameraInfo[]>
  destroy: () => void
}

export interface CaptureSystemOptions {
  /** 设备资源根（DLL 相对路径基准，宿主解析开发/打包差异） */
  resourcesRoot: string
  /** 注册 stub 模拟采集设备（无硬件联调/演示用）；缺省不注册，正式环境零模拟 */
  mock?: boolean
  /** 初始设备档案（持久化回注；不传 = 出厂档案） */
  initialProfiles?: CaptureDeviceProfile[]
  /** 运行时编辑持久化（未注入则编辑仅内存生效） */
  persist?: (profiles: CaptureDeviceProfile[]) => void
  /** 结构化日志（采集日志不含图片内容） */
  logger?: Logger
  /** 采集图片默认保存目录（绝对路径）；未传 req.saveDir 时使用 */
  defaultSaveDir: string
}

/** 创建采集系统（与 createPrintSystem 同构，capture 域通道由 core/src/ipc/capture.ts 注册） */
export function createCaptureSystem(options: CaptureSystemOptions): CaptureSystem {
  const log: CaptureLogFn = (level, message, meta) => options.logger?.[level](message, meta)
  const service = new CaptureService({ ...options, logger: log })
  return {
    listDevices: () => service.listDevices(),
    getProfiles: async () => service.getProfiles(),
    upsertProfile: p => service.upsertProfile(p),
    capture: req => service.capture(req),
    saveDataUrl: (dataUrl, ext) => service.saveDataUrl(dataUrl, ext),
    startPreview: (deviceId, onFrame, opts) => service.startPreview(deviceId, onFrame, opts),
    stopPreview: deviceId => service.stopPreview(deviceId),
    listCameras: deviceId => service.listCameras(deviceId),
    destroy: () => service.destroy(),
  }
}

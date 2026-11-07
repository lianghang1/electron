import type { CaptureCameraInfo, CaptureDevice, CaptureDeviceConfig, CaptureDeviceOverrides, CaptureLogFn, CaptureRequest, CaptureResult } from '@shell/shared'
import type { Logger } from '@shell/kernel/logger'
import type { DeviceHost } from '../../host/device-host'
import { CaptureService } from './service'

export { BUILT_IN_CAPTURE_CONFIGS } from './configs'

export interface CaptureSystem {
  listDevices: () => Promise<CaptureDevice[]>
  getConfigs: () => Promise<CaptureDeviceConfig[]>
  setConfig: (id: string, overrides: CaptureDeviceOverrides) => void
  /** 域默认设备 id（未配置返回 undefined） */
  getDefaultDevice: () => string | undefined
  /** 设置域默认设备（undefined = 清除，回落自动定位） */
  setDefaultDevice: (id: string | undefined) => void
  /**
   * 默认设备解析：配置的默认设备且就绪才返回其 id，否则 undefined
   * （snap/openCaptureDialog 缺省定位共用，失败静默回落）
   */
  resolveDefaultDevice: () => Promise<string | undefined>
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
  /** 设备守护进程（DLL 探测的 koffi 调用崩溃隔离在 host 进程，主进程零 native 依赖） */
  host: DeviceHost
  /** 现场白名单覆盖（历史持久化回注；不传 = 出厂档案原样） */
  initialOverrides?: CaptureDeviceOverrides[]
  /** 运行时编辑持久化（白名单覆盖形状；未注入则编辑仅内存生效） */
  persist?: (overrides: CaptureDeviceOverrides[]) => void
  /** 域默认设备 id 持久化读（未注入 = 无默认设备能力） */
  getDefaultDeviceId?: () => string | undefined
  /** 域默认设备 id 持久化写（undefined = 清除） */
  setDefaultDeviceId?: (id: string | undefined) => void
  /** 结构化日志（采集日志不含图片内容） */
  logger?: Logger
  /** 采集图片保存目录（绝对路径，平台自管统一根目录 files/capture/，渲染层不可指定） */
  defaultSaveDir: string
}

/** 创建采集系统（与 createPrintSystem 同构，capture 域通道由 core/src/ipc/capture.ts 注册） */
export function createCaptureSystem(options: CaptureSystemOptions): CaptureSystem {
  const log: CaptureLogFn = (level, message, meta) => options.logger?.[level](message, meta)
  const service = new CaptureService({ ...options, logger: log })
  return {
    listDevices: () => service.listDevices(),
    getConfigs: async () => service.getConfigs(),
    setConfig: (id, overrides) => service.setConfig(id, overrides),
    getDefaultDevice: () => service.getDefaultDevice(),
    setDefaultDevice: id => service.setDefaultDevice(id),
    resolveDefaultDevice: () => service.resolveDefaultDevice(),
    capture: req => service.capture(req),
    saveDataUrl: (dataUrl, ext) => service.saveDataUrl(dataUrl, ext),
    startPreview: (deviceId, onFrame, opts) => service.startPreview(deviceId, onFrame, opts),
    stopPreview: deviceId => service.stopPreview(deviceId),
    listCameras: deviceId => service.listCameras(deviceId),
    destroy: () => service.destroy(),
  }
}

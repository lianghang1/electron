/** capture 模块统一契约 —— 多品牌（华视/哲林/良田/点易拍…）× 多接入方式（dll/service/wia/uvc/stub） */

/** 接入方式（适配器路线） */
export type CaptureTransport = 'dll' | 'service' | 'wia' | 'uvc' | 'stub' | 'ws'

/** 统一设备视图（各适配器上报后合并） */
export interface CaptureDevice {
  /** 统一 ID："<transport>:<设备键>"，如 "stub:scanner"、"service:dianyipai-01" */
  id: string
  displayName: string
  brand: string
  transport: CaptureTransport
  status: 'ready' | 'offline' | 'unavailable'
  capabilities: CaptureCaps
  /** 平台/适配器私有信息（业务层不读） */
  meta: Record<string, unknown>
}

export interface CaptureCaps {
  /** 自动定边/裁边（厂商 SDK 魔法，UVC 路线没有） */
  crop?: boolean
  /** 矫正/去畸变 */
  desewarp?: boolean
  /** 双面合并 PDF */
  dualPage?: boolean
  /** OCR 识别 */
  ocr?: boolean
  /** 最高分辨率 DPI（估算） */
  maxDpi?: number
}

export interface CaptureRequest {
  deviceId: string
  /** 图片保存目录，默认 userData/capture */
  saveDir?: string
  format?: 'jpg' | 'png' | 'bmp'
  /** 分辨率序号（设备枚举 resolutionList 的索引；ws/camsdk 路线生效，缺省 0 = 设备默认） */
  resolutionNum?: number
}

/** 摄像头枚举条目（ws/camsdk GetCameraInfo）：name 供下拉展示、id 即 devNum */
export interface CaptureCameraInfo {
  id: number
  name: string
  /** 1=文档摄像头，2=人像摄像头（厂商协议定义） */
  funcType: number
  /** 分辨率串列表（如 "1280x720"），序号即 OpenCamera 的 resolutionNum */
  resolutions: string[]
}

export interface CaptureError {
  code: CaptureErrorCode
  message: string
  detail?: unknown
}

export type CaptureLogFn = (
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
) => void

export type CaptureErrorCode
  = | 'DEVICE_NOT_FOUND'
    | 'DEVICE_OFFLINE'
    | 'CAPTURE_FAILED'
    | 'ADAPTER_UNAVAILABLE'
    | 'SAVE_FAILED'
    | 'VALIDATION_FAILED'
    | 'UNKNOWN'

export interface CaptureResult {
  ok: boolean
  /** 采集产出的图片文件绝对路径（可直接喂给 print.submit image 负载） */
  imagePath?: string
  /** 缩略图 dataURL（UI 预览用，免 file:// 权限问题） */
  thumbDataUrl?: string
  meta?: Record<string, unknown>
  error?: CaptureError
}

/** 品牌设备档案 —— 出厂值见 core BUILT_IN_CAPTURE_PROFILES，运行时编辑持久化 userData */
export interface CaptureDeviceProfile {
  id: string
  brand: string
  displayName: string
  transport: CaptureTransport
  /** dll 路线：DLL 路径（asar 外）+ koffi 函数签名（拿到厂商 .h 后填写） */
  dll?: { file: string, functions?: Record<string, string> }
  /**
   * ws 路线：厂商本地 WebSocket 服务。
   * protocol：'dianyipai'（点易拍 BaucheSDK 二进制帧，缺省）| 'camsdk'（华视 CamSDKServer JSON 帧）。
   * camId：点易拍为摄像头编号，camsdk 下为 devNum。verified = 协议帧已验证（缺省视为已验证）。
   */
  ws?: { url: string, protocol?: 'dianyipai' | 'camsdk', camId?: number, width?: number, height?: number, verified?: boolean }
  /** service 路线：厂商本地 HTTP 服务模板 */
  service?: {
    baseUrl: string
    listPath?: string
    capturePath: string
    method?: 'GET' | 'POST'
    /** 响应中图片 base64 的字段名，或 'raw' 表示响应体即图片字节 */
    imageField?: string
    extraHeaders?: Record<string, string>
  }
  capabilities?: CaptureCaps
}

/** 采集适配器统一接口 —— 新接入方式 = 实现本接口并注册 */
export interface CaptureAdapter {
  readonly transport: CaptureTransport
  listDevices: () => Promise<CaptureDevice[]>
  capture: (req: CaptureRequest, device: CaptureDevice) => Promise<CaptureResult>
  destroy?: () => void
  /**
   * 实时预览（可选能力）：开启后预览帧经 onFrame 持续回调（JPEG base64），
   * 会话保持开启供 capture 走会话内拍照；仅支持常驻连接的适配器（ws/camsdk）实现。
   */
  startPreview?: (deviceId: string, onFrame: (base64: string) => void, opts?: { resolutionNum?: number }) => Promise<CaptureResult>
  /** 关闭实时预览（可选能力） */
  stopPreview?: (deviceId: string) => Promise<CaptureResult>
  /** 枚举设备下的摄像头与分辨率（可选能力，ws/camsdk GetCameraInfo） */
  listCameras?: (deviceId: string) => Promise<CaptureCameraInfo[]>
}

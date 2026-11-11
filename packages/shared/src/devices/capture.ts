/** capture 模块统一契约 —— 多品牌（华视/良田/点易拍…）× 多接入方式（dll/service/wia/uvc/stub） */

/** 接入方式（通道路线） */
export type CaptureTransport = 'dll' | 'service' | 'wia' | 'uvc' | 'stub' | 'ws'

/** 统一设备视图（各通道上报后合并） */
export interface CaptureDevice {
  /** 统一 ID："<transport>:<设备键>"，如 "stub:scanner"、"service:dianyipai-01" */
  id: string
  displayName: string
  brand: string
  transport: CaptureTransport
  status: 'ready' | 'offline' | 'unavailable'
  capabilities: CaptureCaps
  /** 平台/通道私有信息（业务层不读） */
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
  /**
   * 采集设备 id（"<transport>:<配置 id>"）。缺省时 Main 按域默认设备自动定位
   * （系统设置指定的默认设备优先，回落第一个就绪设备），调用方无需感知设备 id
   */
  deviceId?: string
  format?: 'jpg' | 'png' | 'bmp'
  /** 分辨率序号（设备枚举 resolutionList 的索引；ws/camsdk 路线生效，缺省 0 = 设备默认） */
  resolutionNum?: number
}

/**
 * 通道内部采集请求 = 对外契约 + 平台注入的保存目录。
 * 保存目录是平台内部事务（userData/capture），渲染层不可指定——否则等于开放任意路径写文件
 */
export interface ChannelCaptureRequest extends CaptureRequest {
  saveDir: string
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

export type CaptureLogFn = (
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
) => void

export type CaptureErrorCode
  = | 'DEVICE_NOT_FOUND'
    | 'DEVICE_OFFLINE'
    | 'DEVICE_BUSY'
    | 'CAPTURE_FAILED'
    | 'CHANNEL_UNAVAILABLE'
    | 'SAVE_FAILED'
    | 'VALIDATION_FAILED'
    | 'UNKNOWN'

/** 采集成功结果（失败以 IpcRemoteError 抛出，code 见 CaptureErrorCode） */
export interface CaptureResult {
  /** 采集产出的图片文件绝对路径（可直接喂给 print.submitPrintJob image 负载） */
  imagePath: string
  /** 缩略图 dataURL（UI 预览用，免 file:// 权限问题） */
  thumbDataUrl?: string
  meta?: Record<string, unknown>
}

/** 内置 UI 浮层拍摄请求：页面经桥发起，Main 打开拍摄浮层窗（会话全局互斥） */
export interface CaptureDialogRequest {
  /** 预选采集设备 id（缺省 = 浮层内自选；uvc: 开头为本机摄像头，浮层自拿流） */
  deviceId?: string
  /**
   * 预选设备名兜底：UVC 摄像头的 deviceId 按 session 随机化，浮层窗独立 partition
   * 枚举出的 id 与发起页不一致——跨窗口传设备必须带 label 供二次匹配
   */
  deviceLabel?: string
  /** ws/camsdk 分辨率序号（设备枚举 resolutionList 的索引） */
  resolutionNum?: number
  /** 浮层标题（缺省「拍摄」） */
  title?: string
  format?: 'jpg' | 'png' | 'bmp'
  /** 可拍摄张数（缺省 1）：1 = 每拍一张替换前一张；>1 = 可拍多张，拍满后禁拍，确认后一次回传 */
  maxCount?: number
}

/** 拍摄浮层关闭原因：confirmed=确认回传后关闭，cancelled=用户取消，tabClosed=发起 tab 已销毁，error=会话异常 */
export type CaptureDialogClosedReason = 'confirmed' | 'cancelled' | 'tabClosed' | 'error'

/** 拍摄浮层会话描述（浮层窗渲染数据源；sessionId 防过期卡片渲染） */
export interface CaptureDialogSession {
  sessionId: string
  title: string
  /** 发起方 App（展示与结果回传路由） */
  appId: string
  appName: string
  deviceId?: string
  /** 发起页传的设备名（UVC deviceId 跨窗口不可靠，浮层按 label 二次匹配） */
  deviceLabel?: string
  resolutionNum?: number
  format?: 'jpg' | 'png' | 'bmp'
  /** 可拍摄张数（缺省 1），浮层按此限制拍摄与展示计数 */
  maxCount?: number
}

/** 设备接入配置（代码出厂预设锁死清单与全部技术字段；现场仅白名单字段可调，见 CaptureDeviceOverrides） */
export interface CaptureDeviceConfig {
  id: string
  brand: string
  displayName: string
  transport: CaptureTransport
  /**
   * ws 路线：厂商本地 WebSocket 服务。
   * protocol：'dianyipai'（点易拍 BaucheSDK 二进制帧，缺省）| 'camsdk'（CamSDKServer JSON 帧，华夏电通）。
   * camId：点易拍为摄像头编号，camsdk 下为 devNum。verified = 协议帧已验证（缺省视为已验证）。
   * wake：探活失败后的拉起方式。command = 现场覆盖命令（按平台 shell 解释，最高优先级）；
   * 缺省走内置发现式策略（按 brand 匹配厂商计划任务/服务/systemd unit）。
   */
  ws?: { url: string, protocol?: 'dianyipai' | 'camsdk', camId?: number, width?: number, height?: number, verified?: boolean, wake?: { command?: string } }
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

/** DLL 二进制描述（koffi 相对资源根路径 + 函数签名；core 内部注册表持有，传输给守护进程用） */
export interface CaptureDllBinary {
  file: string
  functions?: Record<string, string>
}

/**
 * 现场可调白名单（持久化与界面提交的唯一形状）：名称 + 连接参数。
 * 档案清单、品牌、接入方式、协议、能力、DLL 均由代码出厂预设锁死，本地存储仅覆盖白名单字段。
 */
export interface CaptureDeviceOverrides {
  /** 档案锚点：持久化列表按 id 与出厂档案对位；IPC 提交时由通道参数携带，字段内可缺省 */
  id?: string
  displayName?: string
  ws?: { url?: string, camId?: number, width?: number, height?: number, wake?: { command?: string } }
  service?: { baseUrl?: string, listPath?: string, capturePath?: string }
}

/** 采集通道统一接口 —— 新接入方式 = 实现本接口并注册。失败统一抛 CaptureError（code 见 CaptureErrorCode） */
export interface CaptureChannel {
  readonly transport: CaptureTransport
  listDevices: () => Promise<CaptureDevice[]>
  capture: (req: ChannelCaptureRequest, device: CaptureDevice) => Promise<CaptureResult>
  destroy?: () => void
  /**
   * 实时预览（可选能力）：开启后预览帧经 onFrame 持续回调（JPEG base64），
   * 会话保持开启供 capture 走会话内拍照；仅支持常驻连接的通道（ws/camsdk）实现。
   */
  startPreview?: (deviceId: string, onFrame: (base64: string) => void, opts?: { resolutionNum?: number }) => Promise<void>
  /** 关闭实时预览（可选能力） */
  stopPreview?: (deviceId: string) => Promise<void>
  /** 枚举设备下的摄像头与分辨率（可选能力，ws/camsdk GetCameraInfo） */
  listCameras?: (deviceId: string) => Promise<CaptureCameraInfo[]>
}

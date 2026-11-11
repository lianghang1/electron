/**
 * signature 模块统一契约 —— 手写签名域（手写板/签名屏）。
 * 与 idcard 平级的独立原子模块。不并入 idcard 的理由：产出物不同（笔迹点集 vs 结构化证件数据），
 * 交互形态不同（会话式实时推送 vs 一次性读取）。
 */

export type SignDeviceTransport = 'dll' | 'stub' | 'ws'

/** 档案公共段：档案 id / 名称 / 厂商（signature 域 ws/dll 两路线共用） */
interface SignProfileBase {
  id: string
  displayName: string
  /** 厂商标识（面板展示用） */
  brand: string
}

/**
 * 设备档案（多设备档案制，与 capture/idcard 同构）：
 * - ws 路线：一条档案 = 一条 CamSDKServer 本地服务连接（服务下全部签名屏经该连接枚举）；
 * - dll 路线：一条档案 = 一个设备守护进程签名驱动（档案 id = 驱动名，见 host/run.ts），
 *   运行时设备 id = "dll:<档案 id>"，DLL 由守护进程按注册表自动加载。
 */
export interface SignWsProfile extends SignProfileBase {
  transport: 'ws'
  /** ws 连接参数 */
  ws: { url: string }
}

export interface SignDllProfile extends SignProfileBase {
  transport: 'dll'
}

export type SignDeviceConfig = SignWsProfile | SignDllProfile

/**
 * 现场可调白名单（持久化与界面提交的唯一形状）：名称 + ws 地址。
 * 档案清单与全部技术字段（品牌/接入方式/驱动）由代码出厂预设锁死，本地存储仅覆盖白名单字段。
 */
export interface SignatureDeviceOverrides {
  /** 档案锚点：持久化列表按 id 与出厂档案对位；IPC 提交时由通道参数携带，字段内可缺省 */
  id?: string
  displayName?: string
  ws?: { url?: string }
}

/** signature 域配置 = 设备档案列表（持久化 device-signature.json 根对象 { devices: [...] }） */
export type SignatureConfig = SignDeviceConfig[]

export interface SignDevice {
  /** "<transport>:<驱动名>"，如 "dll:hanvon"、"stub:pad"（约定与 idcard/capture 同构） */
  id: string
  displayName: string
  brand: string
  transport: SignDeviceTransport
  status: 'ready' | 'offline' | 'unavailable'
  meta: Record<string, unknown>
}

/** 笔迹采样点（设备原始坐标系，原点左上；渲染层按板面宽高等比缩放） */
export interface SignStrokePoint {
  x: number
  y: number
  /** 压感 0~1（无压感设备恒 1） */
  pressure: number
  /** 落笔状态：down = 起笔（新笔画首点），move = 运笔，up = 抬笔（笔画末点） */
  phase: 'down' | 'move' | 'up'
}

/** 单笔笔画：按时间序排列的采样点 */
export interface SignStroke {
  points: SignStrokePoint[]
}

export type SignErrorCode
  = | 'DEVICE_NOT_FOUND'
    | 'DEVICE_OFFLINE'
    | 'CHANNEL_UNAVAILABLE'
    | 'SESSION_ACTIVE'
    | 'SESSION_NOT_ACTIVE'
    | 'PROTOCOL_PENDING'
    | 'VALIDATION_FAILED'
    | 'UNKNOWN'

/** 开始会话结果（失败以 IpcRemoteError 抛出，code 见 SignErrorCode） */
export interface SignStartResult {
  /** 板面宽（点坐标系上限，renderer 画布等比缩放基准） */
  width: number
  /** 板面高 */
  height: number
  meta?: Record<string, unknown>
}

/**
 * 结束会话结果：完整笔迹点集，签名图由渲染层 canvas/SVG 自绘（设备侧不产位图）；失败以 IpcRemoteError 抛出。
 * 例外：ws 厂商（CamSDK 签名屏 PadViewer）为设备侧产位图模式——strokes 恒空，位图经下方字段交付。
 */
export interface SignSessionResult {
  /** 笔画数（0 = 未书写） */
  strokeCount: number
  strokes: SignStroke[]
  width: number
  height: number
  /** 设备侧产位图模式（ws 厂商）：签名图 dataURL；笔迹点模式恒无 */
  signImageDataUrl?: string
  /** 设备侧指纹图 dataURL（CamSDK 签字&指纹一体流程返回时存在） */
  fingerImageDataUrl?: string
  meta?: Record<string, unknown>
}

/**
 * signature 模块统一契约 —— 手写签名域（手写板/签名屏）。
 * 与 idcard 平级的独立原子模块。不并入 idcard 的理由：产出物不同（笔迹点集 vs 结构化证件数据），
 * 交互形态不同（会话式实时推送 vs 一次性读取）。
 */

export type SignDeviceTransport = 'dll' | 'stub'

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
    | 'ADAPTER_UNAVAILABLE'
    | 'SESSION_ACTIVE'
    | 'SESSION_NOT_ACTIVE'
    | 'PROTOCOL_PENDING'
    | 'UNKNOWN'

export interface SignStartResult {
  ok: boolean
  /** 板面宽（点坐标系上限，renderer 画布等比缩放基准） */
  width?: number
  /** 板面高 */
  height?: number
  meta?: Record<string, unknown>
  error?: { code: SignErrorCode, message: string, detail?: unknown }
}

/** 结束会话结果：完整笔迹点集，签名图由渲染层 canvas/SVG 自绘（设备侧不产位图） */
export interface SignSessionResult {
  ok: boolean
  /** 笔画数（0 = 未书写） */
  strokeCount?: number
  strokes?: SignStroke[]
  width?: number
  height?: number
  meta?: Record<string, unknown>
  error?: { code: SignErrorCode, message: string, detail?: unknown }
}

export interface SignActionResult {
  ok: boolean
  error?: { code: SignErrorCode, message: string, detail?: unknown }
}

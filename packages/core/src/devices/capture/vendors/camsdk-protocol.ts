import type { WsLike } from '../../kernel/channel/ws-channel'
import { captureError } from '../errors'

/**
 * 华视 CamSDKServer JSON 协议层（ws://127.0.0.1:9000，SDK 安装后常驻 Windows 服务）。
 * 协议参考官方 Demo（华视 CamSDK 安装目录下 samples/www/JS/camera/camera.js）：
 *   帧格式：纯 JSON 文本帧；响应统一 { func, reqId, result, errorMsg }，result=0 成功、9=设备使用中。
 * 数据红线：imgBase64/imgBase64Str 为画面与拍摄内容，不写日志。
 */

/** 采集所需的最小设备 ws 配置（protocol 由 WsAdapter 分发，本模块固定 camsdk） */
export type CamSdkConfig = NonNullable<import('@desktop/shared').CaptureDeviceConfig['ws']>

export interface CamSdkFrame {
  func: string
  result?: number
  errorMsg?: string
  /** 拍照响应：图片数组（CameraCapture 返回 imgBase64） */
  imgBase64?: string[]
  /** 预览帧：单串图片数据（GetCameraVideoBuff 预览帧返回 imgBase64Str，无 result/reqId） */
  imgBase64Str?: string
  /** GetCameraInfo 响应：摄像头清单 */
  devInfo?: CamSdkDevInfo[]
  [key: string]: unknown
}

/** GetCameraInfo.devInfo 条目（funcType：1=文档摄像头，2=人像摄像头） */
export interface CamSdkDevInfo {
  id: number
  devName: string
  funcType: number
  /** 多数固件直接给分辨率串列表（"1280x720"） */
  resolutionList?: string[]
  /** 部分固件按 mediaTypes[0].resolutions 给（官方 Demo idFace.js 兼容两种） */
  mediaTypes?: Array<{ resolutions?: string[] }>
}

/** 预览/拍照帧的图片字段兼容取值（不同固件字段名不同） */
export function frameImage(msg: CamSdkFrame): string | undefined {
  return msg.imgBase64Str ?? msg.imgBase64?.[0]
}

/** 解析 CamSDK JSON 文本帧（二进制帧/非法 JSON 返回 null，调用方忽略） */
export function parseCamSdkFrame(data: unknown): CamSdkFrame | null {
  if (typeof data !== 'string') {
    return null
  }
  try {
    return JSON.parse(data) as CamSdkFrame
  }
  catch {
    return null
  }
}

/** 发送指令（统一附带 reqId 与设备号） */
export function sendCamSdk(ws: WsLike, devNum: number, obj: Record<string, unknown>): void {
  ws.send(JSON.stringify({ reqId: String(Date.now()), devNum, ...obj }))
}

/**
 * 响应校验：result 非 0 视为失败；result=9（设备使用中）仅 OpenCamera 阶段可忽略
 * （服务保持既有会话），其余阶段视为失败。失败经 fail 上报并返回 false。
 */
export function checkCamSdkFrame(msg: CamSdkFrame, fail: (err: Error) => void): boolean {
  if (msg.result !== 0 && !(msg.func === 'OpenCamera' && msg.result === 9)) {
    fail(captureError('CAPTURE_FAILED', `华视高拍仪 ${msg.func} 失败（result=${String(msg.result)}）：${String(msg.errorMsg ?? '未知错误')}`))
    return false
  }
  return true
}

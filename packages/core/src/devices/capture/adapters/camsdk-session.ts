import type { CaptureDeviceConfig } from '@desktop/shared'
import { WebSocket } from 'ws'
import { captureError } from '../errors'

/**
 * 华视 CamSDKServer JSON 协议会话（ws://127.0.0.1:9000，SDK 安装后常驻 Windows 服务）。
 * 协议参考官方 Demo（华视 CamSDK 安装目录下 samples/www/JS/camera/camera.js）：
 *   帧格式：纯 JSON 文本帧；响应统一 { func, reqId, result, errorMsg }，result=0 成功、9=设备使用中。
 *   采集序列：OpenCamera → GetCameraVideoBuff(enable) 首帧 → SetCameraImageInfo → CameraCapture(base64) → CloseCamera。
 * 数据红线：imgBase64 为拍摄内容，不写日志。
 */

/** 采集所需的最小设备 ws 配置（protocol 由 WsAdapter 分发，本模块固定 camsdk） */
export type CamSdkConfig = NonNullable<CaptureDeviceConfig['ws']>

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

export interface MiniWS {
  send: (data: string) => void
  close: () => void
  onopen: (() => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: ((err: unknown) => void) | null
  onclose: (() => void) | null
}

export function newSession(cfg: CamSdkConfig): MiniWS {
  // ws 包实现浏览器兼容事件属性（onopen/onmessage...），文本帧 ev.data 为 string
  return new WebSocket(cfg.url) as unknown as MiniWS
}

/** 预览/拍照帧的图片字段兼容取值（不同固件字段名不同） */
export function frameImage(msg: CamSdkFrame): string | undefined {
  return msg.imgBase64Str ?? msg.imgBase64?.[0]
}

/**
 * 单次采集会话：开摄像头 → 等预览首帧 → 设裁切 → 拍照（base64）→ 关摄像头。
 * 返回 JPEG base64（服务端 mime 固定 image/jpeg）。
 */
export function captureCamSdkBase64(cfg: CamSdkConfig, resolutionNum = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const devNum = cfg.camId ?? 0
    let settled = false
    let previewArrived = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const ws = newSession(cfg)

    const done = (err: unknown, base64?: string): void => {
      if (settled) { return }
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      }
      catch {
        /* 忽略 */
      }
      if (err) { reject(err) }
      else { resolve(base64!) }
    }

    const send = (obj: Record<string, unknown>): void => {
      ws.send(JSON.stringify({ reqId: String(Date.now()), devNum, ...obj }))
    }

    const fail = (code: Parameters<typeof captureError>[0], message: string): void => {
      done(captureError(code, message))
    }

    // 预览 + 拍照 + 关闭全链路超时（本地服务 + USB 设备，12s 足够宽裕）
    timer = setTimeout(() => fail('CAPTURE_FAILED', `华视高拍仪采集超时（${cfg.url}）`), 12000)

    const check = (msg: CamSdkFrame): boolean => {
      // result=9（设备使用中）仅 OpenCamera 阶段可忽略（服务保持既有会话），其余阶段视为失败
      if (msg.result !== 0 && !(msg.func === 'OpenCamera' && msg.result === 9)) {
        fail('CAPTURE_FAILED', `华视高拍仪 ${msg.func} 失败（result=${String(msg.result)}）：${String(msg.errorMsg ?? '未知错误')}`)
        return false
      }
      return true
    }

    ws.onopen = () => {
      send({ func: 'OpenCamera', mediaNum: 0, resolutionNum, fps: 5 })
      send({ func: 'GetCameraVideoBuff', enable: true })
    }
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') { return }
      let msg: CamSdkFrame
      try {
        msg = JSON.parse(ev.data) as CamSdkFrame
      }
      catch {
        return
      }
      switch (msg.func) {
        case 'OpenCamera':
          // 校验失败时 check 内部已结束会话（done 幂等），后续分支不再产生副作用
          check(msg)
          break
        case 'GetCameraVideoBuff': {
          // 预览帧带图像数据（不同 SDK 版本字段名为 imgBase64Str / imgBase64）；
          // enable 开关的 ACK 只带 result，按普通响应校验
          const preview = frameImage(msg)
          if (preview) {
            // 预览帧持续推送：只等首帧到达（设备就绪标志），图片内容不处理
            if (!previewArrived) {
              previewArrived = true
              send({ func: 'SetCameraImageInfo', cropType: 1, imageType: 0, fillBorderType: 0, removalForeign: 0, rotate: 0 })
              send({ func: 'CameraCapture', mode: 'base64' })
            }
            break
          }
          if (msg.result !== undefined) {
            check(msg)
          }
          break
        }
        case 'CameraCapture': {
          if (!check(msg)) { return }
          const base64 = frameImage(msg)
          if (!base64) {
            fail('CAPTURE_FAILED', '华视高拍仪拍照成功但未返回图片数据')
            return
          }
          send({ func: 'CloseCamera', devNum })
          done(undefined, base64)
          break
        }
        default:
          break
      }
    }
    ws.onerror = () => fail('DEVICE_OFFLINE', `华视 CamSDKServer 连接失败: ${cfg.url}（确认已安装华视高拍仪 SDK 且服务运行中）`)
    ws.onclose = () => fail('DEVICE_OFFLINE', '华视 CamSDKServer 连接在采集完成前关闭')
  })
}

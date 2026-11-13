import type { WsLike } from '#kernel/channel/ws-channel'
import type { CapturePreviewSession, WsEndpoint } from '../vendor-contracts'
import { connectWs } from '#kernel/channel/ws-channel'
import { captureError } from '../../errors'
import { checkCamSdkFrame, frameImage, parseCamSdkFrame, sendCamSdk } from './protocol'

/**
 * CamSDKServer 常驻预览会话（协议同 protocol.ts，时序参考官方 Demo
 * samples/www/JS/camera/idFace.js）：
 *   预览：OpenCamera(devNum, mediaNum:0, resolutionNum, fps) → SetCameraImageInfo(cropType:1)
 *         → GetCameraVideoBuff(enable:true) → 持续推送带 imgBase64Str 的预览帧
 *   拍照：CameraCapture(mode:'base64')，会话保持开启（与一次性采集的关键差异）
 */
export class CamSdkPreviewSession implements CapturePreviewSession {
  private ws: WsLike | null = null
  private closed = true
  /** 拍照进行中标记（同一会话串行拍照，防并发 CameraCapture 响应错乱） */
  private capturing = false
  private captureSettle: ((err: unknown, base64?: string) => void) | null = null
  private captureTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly cfg: WsEndpoint,
    private readonly resolutionNum: number,
    private readonly onFrame: (base64: string) => void,
  ) {}

  /** 会话是否存活（已开启且未关闭；掉线后自动失效） */
  get active(): boolean {
    return !this.closed
  }

  /** 开摄像头并等首帧（首帧 = 出图就绪标志；服务/设备无响应 10s 超时） */
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const devNum = this.cfg.camId ?? 0
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const ws = connectWs(this.cfg.url)
      this.ws = ws

      const settle = (err?: unknown): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        if (err) {
          this.ws = null
          try {
            ws.close()
          }
          catch {
            /* 忽略 */
          }
          reject(err)
        }
        else {
          this.closed = false
          resolve()
        }
      }

      timer = setTimeout(
        () => settle(captureError('DEVICE_OFFLINE', `CamSDK 高拍仪开启预览超时（${this.cfg.url}）`)),
        10000,
      )

      ws.onopen = () => {
        sendCamSdk(ws, devNum, { func: 'OpenCamera', mediaNum: 0, resolutionNum: this.resolutionNum, fps: 5 })
        sendCamSdk(ws, devNum, { func: 'SetCameraImageInfo', cropType: 1, imageType: 0, fillBorderType: 0, removalForeign: 0, rotate: 0 })
        sendCamSdk(ws, devNum, { func: 'GetCameraVideoBuff', enable: true })
      }
      ws.onmessage = (ev) => {
        const msg = parseCamSdkFrame(ev.data)
        if (!msg) {
          return
        }
        // 预览帧只按 GetCameraVideoBuff 识别（拍照响应也带图，不能按字段名抢判）
        if (msg.func === 'GetCameraVideoBuff') {
          const preview = frameImage(msg)
          if (preview) {
            this.onFrame(preview)
            // 首帧到达 = 出图就绪；此后的帧只回调不打断会话
            settle()
            return
          }
          checkCamSdkFrame(msg, settle)
          return
        }
        if (msg.func === 'OpenCamera') {
          checkCamSdkFrame(msg, settle)
          return
        }
        if (msg.func === 'CameraCapture') {
          this.onCaptureResponse(msg)
        }
      }
      ws.onerror = () => settle(captureError('DEVICE_OFFLINE', `CamSDKServer 连接失败: ${this.cfg.url}`))
      ws.onclose = () => {
        if (!settled) {
          settle(captureError('DEVICE_OFFLINE', 'CamSDKServer 连接在预览建立前关闭'))
          return
        }
        // 已建立的会话掉线：终结在途拍照，会话作废（调用方据此可提示重开）
        this.closed = true
        this.ws = null
        if (this.capturing) {
          this.terminateCapture(captureError('DEVICE_OFFLINE', 'CamSDKServer 连接在拍照完成前关闭'))
        }
      }
    })
  }

  /** 会话内拍照（摄像头保持开启）；返回 JPEG base64 */
  capture(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.closed || !this.ws) {
        reject(captureError('CAPTURE_FAILED', 'CamSDK 高拍仪预览未开启，请先开启预览'))
        return
      }
      if (this.capturing) {
        reject(captureError('CAPTURE_FAILED', 'CamSDK 高拍仪正在拍照中，请稍候'))
        return
      }
      const ws = this.ws
      this.capturing = true
      this.captureSettle = (err, base64) => (err ? reject(err) : resolve(base64!))
      this.captureTimer = setTimeout(() => {
        this.capturing = false
        this.captureSettle = null
        reject(captureError('CAPTURE_FAILED', 'CamSDK 高拍仪拍照超时'))
      }, 12000)
      try {
        sendCamSdk(ws, this.cfg.camId ?? 0, { func: 'CameraCapture', mode: 'base64' })
      }
      catch (err) {
        this.terminateCapture(captureError('DEVICE_OFFLINE', `CamSDK 高拍仪拍照指令发送失败：${String(err)}`))
      }
    })
  }

  /** 释放摄像头（best-effort：连接已死也要把会话标记关闭） */
  close(): void {
    if (this.closed) {
      this.ws = null
      return
    }
    this.closed = true
    const ws = this.ws
    this.ws = null
    if (!ws) {
      return
    }
    try {
      sendCamSdk(ws, this.cfg.camId ?? 0, { func: 'GetCameraVideoBuff', enable: false })
      sendCamSdk(ws, this.cfg.camId ?? 0, { func: 'CloseCamera' })
    }
    catch {
      /* 连接已断时忽略 */
    }
    try {
      ws.close()
    }
    catch {
      /* 忽略 */
    }
  }

  /** 拍照响应处理（仅在途拍照生效） */
  private onCaptureResponse(msg: import('./protocol').CamSdkFrame): void {
    if (!this.capturing) {
      return
    }
    clearTimeout(this.captureTimer)
    this.capturing = false
    const settleFn = this.captureSettle
    this.captureSettle = null
    if (msg.result !== 0) {
      settleFn?.(captureError('CAPTURE_FAILED', `CamSDK 高拍仪拍照失败（result=${String(msg.result)}）：${String(msg.errorMsg ?? '未知错误')}`))
      return
    }
    const base64 = frameImage(msg)
    if (base64) {
      settleFn?.(undefined, base64)
    }
    else {
      settleFn?.(captureError('CAPTURE_FAILED', 'CamSDK 高拍仪拍照成功但未返回图片数据'))
    }
  }

  /** 终结在途拍照并复位状态 */
  private terminateCapture(err: Error): void {
    clearTimeout(this.captureTimer)
    this.capturing = false
    const settleFn = this.captureSettle
    this.captureSettle = null
    settleFn?.(err)
  }
}

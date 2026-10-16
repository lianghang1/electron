import type { CamSdkConfig, CamSdkDevInfo, CamSdkFrame, MiniWS } from './camsdk-session'
import { captureError } from '../errors'
import { frameImage, newSession } from './camsdk-session'

/**
 * 华视 CamSDKServer 常驻预览会话与摄像头枚举（协议同 camsdk-session.ts，
 * 时序参考官方 Demo samples/www/JS/camera/idFace.js）：
 *   预览：OpenCamera(devNum, mediaNum:0, resolutionNum, fps) → SetCameraImageInfo(cropType:1)
 *         → GetCameraVideoBuff(enable:true) → 持续推送带 imgBase64Str 的预览帧
 *   拍照：CameraCapture(mode:'base64')，会话保持开启（与一次性采集的关键差异）
 *   枚举：GetCameraInfo → devInfo[{devName, id, funcType, resolutionList}]（funcType 1=文档 2=人像）
 * 数据红线：imgBase64Str 为画面内容，不写日志。
 */

/** 摄像头枚举条目（对外统一视图，name 供下拉展示、id 即 devNum） */
export interface CamSdkCameraInfo {
  id: number
  name: string
  funcType: number
  resolutions: string[]
}

/** devInfo 条目 → 统一枚举视图（分辨率兼容 resolutionList / mediaTypes[0].resolutions 两种固件） */
function toCameraInfo(dev: CamSdkDevInfo): CamSdkCameraInfo {
  return {
    id: dev.id,
    name: dev.devName,
    funcType: dev.funcType,
    resolutions: dev.resolutionList ?? dev.mediaTypes?.[0]?.resolutions ?? [],
  }
}

/** 枚举本机服务下的摄像头（连接 → GetCameraInfo → 关闭；不占用摄像头） */
export function listCamSdkCameras(cfg: CamSdkConfig): Promise<CamSdkCameraInfo[]> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const ws: MiniWS = newSession(cfg)

    const done = (err: unknown, cameras?: CamSdkCameraInfo[]): void => {
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
      else { resolve(cameras!) }
    }

    timer = setTimeout(() => done(captureError('DEVICE_OFFLINE', `华视 CamSDKServer 枚举超时（${cfg.url}）`)), 6000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ func: 'GetCameraInfo', reqId: String(Date.now()) }))
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
      if (msg.func !== 'GetCameraInfo') { return }
      if (msg.result !== 0) {
        done(captureError('CAPTURE_FAILED', `华视高拍仪枚举失败（result=${String(msg.result)}）：${String(msg.errorMsg ?? '未知错误')}`))
        return
      }
      done(undefined, (msg.devInfo ?? []).map(toCameraInfo))
    }
    ws.onerror = () => done(captureError('DEVICE_OFFLINE', `华视 CamSDKServer 连接失败: ${cfg.url}`))
    ws.onclose = () => done(captureError('DEVICE_OFFLINE', '华视 CamSDKServer 连接在枚举完成前关闭'))
  })
}

/**
 * 常驻预览会话：open 后持续把预览帧（JPEG base64）回调给调用方，
 * capture 在会话内拍照（摄像头不关闭，拍完继续预览），close 释放摄像头。
 */
export class CamSdkPreviewSession {
  private ws: MiniWS | null = null
  private closed = true
  /** 拍照进行中标记（同一会话串行拍照，防并发 CameraCapture 响应错乱） */
  private capturing = false
  private captureSettle: ((err: unknown, base64?: string) => void) | null = null
  private captureTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly cfg: CamSdkConfig,
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
      const ws = newSession(this.cfg)
      this.ws = ws

      const settle = (err?: unknown): void => {
        if (settled) { return }
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

      const send = (obj: Record<string, unknown>): void => {
        ws.send(JSON.stringify({ reqId: String(Date.now()), devNum, ...obj }))
      }

      const check = (msg: CamSdkFrame): boolean => {
        // result=9（设备使用中）与官方 Demo 一致仅 OpenCamera 阶段忽略
        if (msg.result !== 0 && !(msg.func === 'OpenCamera' && msg.result === 9)) {
          settle(captureError('CAPTURE_FAILED', `华视高拍仪 ${msg.func} 失败（result=${String(msg.result)}）：${String(msg.errorMsg ?? '未知错误')}`))
          return false
        }
        return true
      }

      timer = setTimeout(
        () => settle(captureError('DEVICE_OFFLINE', `华视高拍仪开启预览超时（${this.cfg.url}）`)),
        10000,
      )

      ws.onopen = () => {
        send({ func: 'OpenCamera', mediaNum: 0, resolutionNum: this.resolutionNum, fps: 5 })
        send({ func: 'SetCameraImageInfo', cropType: 1, imageType: 0, fillBorderType: 0, removalForeign: 0, rotate: 0 })
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
        // 预览帧只按 GetCameraVideoBuff 识别（拍照响应也带图，不能按字段名抢判）
        if (msg.func === 'GetCameraVideoBuff') {
          const preview = frameImage(msg)
          if (preview) {
            this.onFrame(preview)
            // 首帧到达 = 出图就绪；此后的帧只回调不打断会话
            settle()
            return
          }
          check(msg)
          return
        }
        switch (msg.func) {
          case 'OpenCamera':
            check(msg)
            break
          case 'CameraCapture': {
            if (!this.capturing) { break }
            clearTimeout(this.captureTimer)
            this.capturing = false
            const settleFn = this.captureSettle
            this.captureSettle = null
            if (msg.result !== 0) {
              settleFn?.(captureError('CAPTURE_FAILED', `华视高拍仪拍照失败（result=${String(msg.result)}）：${String(msg.errorMsg ?? '未知错误')}`))
              break
            }
            const base64 = frameImage(msg)
            if (base64) { settleFn?.(undefined, base64) }
            else { settleFn?.(captureError('CAPTURE_FAILED', '华视高拍仪拍照成功但未返回图片数据')) }
            break
          }
          default:
            break
        }
      }
      ws.onerror = () => settle(captureError('DEVICE_OFFLINE', `华视 CamSDKServer 连接失败: ${this.cfg.url}`))
      ws.onclose = () => {
        if (!settled) {
          settle(captureError('DEVICE_OFFLINE', '华视 CamSDKServer 连接在预览建立前关闭'))
          return
        }
        // 已建立的会话掉线：终结在途拍照，会话作废（调用方据此可提示重开）
        this.closed = true
        this.ws = null
        if (this.capturing) {
          clearTimeout(this.captureTimer)
          this.capturing = false
          const settleFn = this.captureSettle
          this.captureSettle = null
          settleFn?.(captureError('DEVICE_OFFLINE', '华视 CamSDKServer 连接在拍照完成前关闭'))
        }
      }
    })
  }

  /** 会话内拍照（摄像头保持开启）；返回 JPEG base64 */
  capture(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.closed || !this.ws) {
        reject(captureError('CAPTURE_FAILED', '华视高拍仪预览未开启，请先开启预览'))
        return
      }
      if (this.capturing) {
        reject(captureError('CAPTURE_FAILED', '华视高拍仪正在拍照中，请稍候'))
        return
      }
      this.capturing = true
      this.captureSettle = (err, base64) => (err ? reject(err) : resolve(base64!))
      this.captureTimer = setTimeout(() => {
        this.capturing = false
        this.captureSettle = null
        reject(captureError('CAPTURE_FAILED', '华视高拍仪拍照超时'))
      }, 12000)
      try {
        this.ws.send(JSON.stringify({ reqId: String(Date.now()), devNum: this.cfg.camId ?? 0, func: 'CameraCapture', mode: 'base64' }))
      }
      catch (err) {
        clearTimeout(this.captureTimer)
        this.capturing = false
        this.captureSettle = null
        reject(captureError('DEVICE_OFFLINE', `华视高拍仪拍照指令发送失败：${String(err)}`))
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
    if (!ws) { return }
    try {
      ws.send(JSON.stringify({ reqId: String(Date.now()), devNum: this.cfg.camId ?? 0, func: 'GetCameraVideoBuff', enable: false }))
      ws.send(JSON.stringify({ reqId: String(Date.now()), devNum: this.cfg.camId ?? 0, func: 'CloseCamera' }))
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
}

import type { CaptureDialogRequest, CaptureRequest, CaptureResult } from '@desktop/shared'
import type { WebContents } from 'electron'
import type { AppRegistry } from '../app/app-registry'
import type { CaptureSystem } from '../devices/capture'
import type { CaptureDialogSessionService } from '../devices/capture/dialog-session'
import type { OverlayWindowService } from '../window/overlay-window'
import type { CallerResolver } from './caller-context'
import { handle } from './handle'

export interface CaptureIpcDeps {
  /** 采集系统（bootstrap 装配，恒创建） */
  capture: CaptureSystem
  /** 拍摄浮层会话服务（bootstrap 装配，恒创建） */
  captureDialog: CaptureDialogSessionService
  /** 拍摄窗身份校验（会话操作仅拍摄窗可回传） */
  overlayService: OverlayWindowService
  /** 浮层标题展示用：按发起 appId 反查 App 显示名 */
  registry: AppRegistry
  resolver: CallerResolver
}

/**
 * capture 域通道注册：图像采集（高拍仪/扫描仪/摄像头）+ 拍摄浮层通道
 * （发起方 openCaptureDialog / closeCaptureDialog + 浮层窗内 dialog* 会话操作）。
 * 失败统一 reject（CaptureError → IpcRemoteError，code 见 CaptureErrorCode，渲染层 try/catch 分支）；
 * 预览帧只推给发起预览的窗口（webContents 直发，不走全局事件广播）。
 */
export function registerCaptureIpc(deps: CaptureIpcDeps): void {
  handle('capture:listDevices', () => deps.capture.listDevices())
  handle('capture:getProfiles', () => deps.capture.getProfiles())
  handle('capture:upsertProfile', (_e, profile) => deps.capture.upsertProfile(profile))
  handle('capture:capture', (_e, req) => deps.capture.capture(sanitizeCaptureRequest(req)))
  handle('capture:saveDataUrl', (_e, input) => deps.capture.saveDataUrl(input.dataUrl, input.ext))
  handle('capture:startPreview', (e, input) => deps.capture.startPreview(input.deviceId, (base64) => {
    forwardFrame(e.sender, input.deviceId, base64)
  }, input.resolutionNum === undefined ? undefined : { resolutionNum: input.resolutionNum }))
  handle('capture:stopPreview', (_e, deviceId) => deps.capture.stopPreview(deviceId))
  handle('capture:listCameras', (_e, deviceId) => deps.capture.listCameras(deviceId))

  // 拍摄浮层发起方通道：按 CallerContext 定身份（结果随 open 的 Promise 交付）
  handle('capture:openCaptureDialog', async (e, req) => {
    const ctx = deps.resolver.resolve(e.sender)
    return deps.captureDialog.open(sanitizeDialogRequest(req), {
      wc: e.sender,
      tabId: ctx.tabId,
      appId: ctx.appId,
      appName: deps.registry.get(ctx.appId)?.name ?? ctx.appId,
    })
  })
  handle('capture:closeCaptureDialog', async (e) => {
    const ctx = deps.resolver.resolve(e.sender)
    deps.captureDialog.cancelByCaller({ appId: ctx.appId, tabId: ctx.tabId })
  })

  // 浮层窗内会话操作：仅拍摄窗可调（会话服务按 webContents 校验归属）
  handle('capture:dialogStartPreview', (e, input) => deps.captureDialog.startPreview(e.sender, input.deviceId, input.resolutionNum === undefined ? undefined : { resolutionNum: input.resolutionNum }))
  handle('capture:dialogStopPreview', e => deps.captureDialog.stopPreview(e.sender))
  handle('capture:dialogCapture', (e, opts) => deps.captureDialog.capture(e.sender, opts))
  handle('capture:dialogConfirm', async (e, results) => deps.captureDialog.confirm(e.sender, sanitizeConfirmResults(results)))
}

/** 预览帧转发（发起窗口销毁后静默丢弃，由 stopPreview 正常回收会话） */
function forwardFrame(sender: WebContents, deviceId: string, base64: string): void {
  if (!sender.isDestroyed()) {
    sender.send('capture:frameReceived', { deviceId, base64 })
  }
}

/** 浮层请求入参收敛：仅接受会话认识的可选字段，非字符串/越界值丢弃 */
function sanitizeDialogRequest(req: CaptureDialogRequest | undefined): CaptureDialogRequest {
  const input = req ?? {}
  const pickString = (value: unknown): string | undefined => {
    if (typeof value !== 'string' || !value.trim()) { return undefined }
    return value.trim()
  }
  const resolutionNum = Number(input.resolutionNum)
  const maxCount = Number(input.maxCount)
  return {
    deviceId: pickString(input.deviceId),
    deviceLabel: pickString(input.deviceLabel),
    resolutionNum: Number.isInteger(resolutionNum) && resolutionNum >= 0 ? resolutionNum : undefined,
    title: pickString(input.title),
    format: input.format === 'png' || input.format === 'bmp' ? input.format : input.format === 'jpg' ? 'jpg' : undefined,
    maxCount: Number.isInteger(maxCount) && maxCount >= 1 ? maxCount : undefined,
  }
}

/** capture 通道入参收敛：白名单重建，保存目录等平台内部字段即使传入也被丢弃 */
function sanitizeCaptureRequest(req: CaptureRequest | undefined): CaptureRequest {
  const input = req ?? { deviceId: '' }
  const pickString = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim()) { return '' }
    return value.trim()
  }
  const resolutionNum = Number(input.resolutionNum)
  return {
    deviceId: pickString(input.deviceId),
    resolutionNum: Number.isInteger(resolutionNum) && resolutionNum >= 0 ? resolutionNum : undefined,
    format: input.format === 'png' || input.format === 'bmp' ? input.format : input.format === 'jpg' ? 'jpg' : undefined,
  }
}

/** 确认回传入参收敛：丢弃缺 imagePath 的项（Main 侧 confirm 还会做非空校验） */
function sanitizeConfirmResults(results: CaptureResult[] | undefined): CaptureResult[] {
  if (!Array.isArray(results)) { return [] }
  return results.filter(r => !!r && typeof r.imagePath === 'string' && r.imagePath.length > 0)
}

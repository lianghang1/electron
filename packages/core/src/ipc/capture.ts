import type { WebContents } from 'electron'
import type { CaptureSystem } from '../devices/capture'
import { handle } from './handle'

export interface CaptureIpcDeps {
  /** 采集系统（bootstrap 装配，恒创建） */
  capture: CaptureSystem
}

/**
 * capture 域通道注册：图像采集（高拍仪/扫描仪/摄像头）。
 * 失败统一 reject（CaptureError → IpcRemoteError，code 见 CaptureErrorCode，渲染层 try/catch 分支）；
 * 预览帧只推给发起预览的窗口（webContents 直发，不走全局事件广播）。
 */
export function registerCaptureIpc(deps: CaptureIpcDeps): void {
  handle('capture:listDevices', () => deps.capture.listDevices())
  handle('capture:getProfiles', () => deps.capture.getProfiles())
  handle('capture:upsertProfile', (_e, profile) => deps.capture.upsertProfile(profile))
  handle('capture:capture', (_e, req) => deps.capture.capture(req))
  handle('capture:saveDataUrl', (_e, dataUrl, ext) => deps.capture.saveDataUrl(dataUrl, ext))
  handle('capture:startPreview', (e, deviceId, opts) => deps.capture.startPreview(deviceId, (base64) => {
    forwardFrame(e.sender, deviceId, base64)
  }, opts))
  handle('capture:stopPreview', (_e, deviceId) => deps.capture.stopPreview(deviceId))
  handle('capture:listCameras', (_e, deviceId) => deps.capture.listCameras(deviceId))
}

/** 预览帧转发（发起窗口销毁后静默丢弃，由 stopPreview 正常回收会话） */
function forwardFrame(sender: WebContents, deviceId: string, base64: string): void {
  if (!sender.isDestroyed()) {
    sender.send('capture:onPreviewFrame', { deviceId, base64 })
  }
}

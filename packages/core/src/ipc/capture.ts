import type { CaptureSystem } from '../devices/capture'
import { handle } from './handle'

export interface CaptureIpcDeps {
  /** 采集系统（bootstrap 装配，恒创建） */
  capture: CaptureSystem
}

/**
 * capture 域通道注册：图像采集（高拍仪/扫描仪/摄像头）。
 * 硬件操作永不 reject，失败以 CaptureResult.error 字段回传（渲染层无需 try/catch）。
 */
export function registerCaptureIpc(deps: CaptureIpcDeps): void {
  handle('capture:listDevices', () => deps.capture.listDevices())
  handle('capture:getProfiles', () => deps.capture.getProfiles())
  handle('capture:upsertProfile', (_e, profile) => deps.capture.upsertProfile(profile))
  handle('capture:capture', (_e, req) => deps.capture.capture(req))
  handle('capture:saveDataUrl', (_e, dataUrl, ext) => deps.capture.saveDataUrl(dataUrl, ext))
}

import type { CaptureResult } from '@desktop/shared'
import type { CaptureSystem } from '../devices/capture'
import type { CaptureDialogSessionService } from '../devices/capture/dialog-session'
import type { OverlayWindowService } from '../window/overlay-window'
import { handle } from './handle'

export interface CaptureDialogIpcDeps {
  /** 拍摄浮层会话服务（bootstrap 装配，恒创建）：浮层内操作全部走会话上下文 */
  captureDialog: CaptureDialogSessionService
  /** 会话内拍照借用采集系统（ws/SDK 路线） */
  capture: CaptureSystem
  overlayService: OverlayWindowService
}

/**
 * captureDialog 域通道注册：拍摄浮层窗专属（仅拍摄窗挂载该域）。
 * 预览 / 拍摄 / 确认在会话上下文内闭环（webContents 身份校验由会话服务承担）；
 * 域归属关卡由 handle 层统一兜底，浮层窗挂载清单不含 capture 域。
 */
export function registerCaptureDialogIpc(deps: CaptureDialogIpcDeps): void {
  handle('captureDialog:sync', (e) => {
    return deps.overlayService.syncCapture(e.sender)
  })
  handle('captureDialog:listDevices', () => deps.capture.listDevices())
  handle('captureDialog:listCameras', (_e, deviceId) => deps.capture.listCameras(String(deviceId)))
  handle('captureDialog:startPreview', (e, deviceId, opts) => deps.captureDialog.startPreview(e.sender, String(deviceId), opts))
  handle('captureDialog:stopPreview', e => deps.captureDialog.stopPreview(e.sender))
  handle('captureDialog:capture', (e, opts) => deps.captureDialog.capture(e.sender, opts))
  handle('captureDialog:confirm', async (e, results) => deps.captureDialog.confirm(e.sender, sanitizeConfirmResults(results)))
  handle('captureDialog:dismiss', (e) => {
    if (!deps.overlayService.isCaptureWindow(e.sender)) {
      return
    }
    deps.captureDialog.cancelByOverlay()
  })
}

/** 确认回传入参收敛：丢弃缺 imagePath 的项（Main 侧 confirm 还会做非空校验） */
function sanitizeConfirmResults(results: CaptureResult[] | undefined): CaptureResult[] {
  if (!Array.isArray(results)) { return [] }
  return results.filter(r => !!r && typeof r.imagePath === 'string' && r.imagePath.length > 0)
}

import type { AppService } from '@shell/app-runtime'
import type { CallerRegistry, CaptureResult } from '@shell/shared'
import type { CaptureDialogSessionService } from '../capture-dialog'
import { registerIpcDomain } from '@shell/bridge/handle'
import { captureDialogDomain } from '@shell/shared/ipc'
import { callerOf } from './caller'

export interface CaptureDialogIpcDeps {
  callers: CallerRegistry
  apps: AppService
  /** 壳层拍摄浮层会话编排（组合根装配；拍摄能力未启用时缺省） */
  dialog?: CaptureDialogSessionService
}

/**
 * captureDialog 域注册：拍摄浮层会话（编排见 ../capture-dialog.ts）——发起方身份从账本反查，
 * 浮层内操作按窗口归属校验。frame 推送由壳编排直推浮层窗，不在注册面。
 * 拍摄编排未装配时以错误拒绝（bootstrap 未配置 capture 属配置错误，渲染层按码提示）。
 */
export function registerCaptureDialogIpc(deps: CaptureDialogIpcDeps): void {
  const confirmResults = (input: unknown): CaptureResult[] => {
    if (!Array.isArray(input)) { return [] }
    return input.filter((item): item is CaptureResult => {
      const r = item as Partial<CaptureResult> | null
      return !!r && typeof r.imagePath === 'string' && r.imagePath.length > 0
    })
  }
  const dialog = () => {
    if (!deps.dialog) { throw new Error('拍摄系统未装配（bootstrap 未配置 capture）') }
    return deps.dialog
  }
  registerIpcDomain(captureDialogDomain, {
    open: (event, input) => {
      const caller = callerOf(deps.callers, event.sender.id)
      const appName = deps.apps.list().find(r => r.manifest.id === caller.appId)?.manifest.name ?? caller.appId
      return dialog().open(input, {
        wc: event.sender,
        tabId: caller.instanceId,
        appId: caller.appId,
        appName,
      })
    },
    close: () => {
      // 浮层页 × / ESC 回传的取消：按浮层窗身份 finish 账本，不能用发起方身份匹配
      dialog().cancelByOverlay()
    },
    listDevices: event => dialog().listDevices(event.sender),
    listDeviceCameras: (event, deviceId) => dialog().listDeviceCameras(event.sender, String(deviceId ?? '')),
    startPreview: (event, input) =>
      dialog().startPreview(event.sender, String(input.deviceId ?? ''), typeof input.resolutionNum === 'number' ? { resolutionNum: input.resolutionNum } : undefined),
    stopPreview: event => dialog().stopPreview(event.sender),
    snap: (event, opts) => dialog().capture(event.sender, opts),
    confirm: (event, results) => dialog().confirm(event.sender, confirmResults(results)),
  })
}

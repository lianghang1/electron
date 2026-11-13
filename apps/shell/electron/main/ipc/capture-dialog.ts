import type { AppService } from '@shell/app-runtime'
import type { DeviceGateway } from '@shell/devices'
import type { CallerRegistry, CaptureDialogRequest, CaptureResult } from '@shell/shared'
import { registerIpcDomain } from '@shell/bridge/handle'
import { captureDialogDomain } from '@shell/shared/ipc'
import { callerOf } from './caller'

export interface CaptureDialogIpcDeps {
  callers: CallerRegistry
  apps: AppService
  devices: DeviceGateway
}

/**
 * captureDialog 域注册：拍摄浮层会话（master ipc/capture.ts）——发起方身份从账本反查，
 * 浮层内操作按窗口归属校验。frame 推送由 devices 拍摄域直推浮层窗，不在注册面。
 * 拍摄系统未装配时以错误拒绝（bootstrap 未配置 capture 属配置错误，渲染层按码提示）。
 */
export function registerCaptureDialogIpc(deps: CaptureDialogIpcDeps): void {
  const pickString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined
  const dialogRequest = (input: unknown): CaptureDialogRequest => {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
    const resolutionNum = Number(raw.resolutionNum)
    const maxCount = Number(raw.maxCount)
    return {
      deviceId: pickString(raw.deviceId),
      deviceLabel: pickString(raw.deviceLabel),
      title: pickString(raw.title),
      resolutionNum: Number.isInteger(resolutionNum) && resolutionNum >= 0 ? resolutionNum : undefined,
      maxCount: Number.isInteger(maxCount) && maxCount >= 1 ? maxCount : undefined,
      format: raw.format === 'jpg' || raw.format === 'png' || raw.format === 'bmp' ? raw.format : undefined,
    }
  }
  const confirmResults = (input: unknown): CaptureResult[] => {
    if (!Array.isArray(input)) { return [] }
    return input.filter((item): item is CaptureResult => {
      const r = item as Partial<CaptureResult> | null
      return !!r && typeof r.imagePath === 'string' && r.imagePath.length > 0
    })
  }
  const dialog = () => {
    const captureDialog = deps.devices.captureDialog
    if (!captureDialog) { throw new Error('拍摄系统未装配（bootstrap 未配置 capture）') }
    return captureDialog
  }
  registerIpcDomain(captureDialogDomain, {
    open: (event, input) => {
      const caller = callerOf(deps.callers, event.sender.id)
      const appName = deps.apps.list().find(r => r.manifest.id === caller.appId)?.manifest.name ?? caller.appId
      return dialog().open(dialogRequest(input), {
        wc: event.sender,
        tabId: caller.instanceId,
        appId: caller.appId,
        appName,
      })
    },
    close: (event) => {
      const caller = callerOf(deps.callers, event.sender.id)
      dialog().cancelByCaller({ appId: caller.appId, tabId: caller.instanceId })
    },
    startPreview: (event, deviceId, resolutionNum) =>
      dialog().startPreview(event.sender, String(deviceId ?? ''), typeof resolutionNum === 'number' ? { resolutionNum } : undefined),
    stopPreview: event => dialog().stopPreview(event.sender),
    snap: (event, opts) => dialog().capture(event.sender, opts),
    confirm: (event, results) => dialog().confirm(event.sender, confirmResults(results)),
  })
}

import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { CaptureDialogSessionService } from './dialog-session'
import type { CaptureSystem } from './index'
import { z } from 'zod'
import { DomainRouteError } from '../../domain-kit'
import {
  captureConfigInput,
  captureRequestInput,
  dataUrlInput,
  noInput,
  nullableIdInput,
  optionalDeviceInput,
  requiredDeviceInput,
} from '../input-schemas'

/** capture 域：高拍仪 / 摄像采集（预览帧经 ctx.push 点对点送达发起方窗口）。 */

/** 浮层会话延迟取用：gateway 装配顺序里对话框服务晚于域定义构建，调用时才解析 */
export type CaptureDialogGetter = () => CaptureDialogSessionService | undefined

/** 原生拍摄浮层请求：与 shared CaptureDialogRequest 同形，浮层内闭环拍摄后整批回传 */
const captureDialogInput = z.object({
  deviceId: z.string().optional(),
  deviceLabel: z.string().optional(),
  resolutionNum: z.number().int().optional(),
  title: z.string().optional(),
  format: z.enum(['jpg', 'png', 'bmp']).optional(),
  maxCount: z.number().int().min(1).optional(),
}).passthrough()

export function createCaptureMethods(capture: CaptureSystem, deps: DomainDeps, getDialog?: CaptureDialogGetter): DomainDefinition['methods'] {
  return {
    listDevices: {
      input: noInput,
      output: z.unknown(),
      handler: () => capture.listDevices(),
    },
    listDeviceConfigs: {
      input: noInput,
      output: z.unknown(),
      handler: () => capture.listDeviceConfigs(),
    },
    setConfig: {
      input: captureConfigInput,
      output: z.unknown(),
      handler: ({ deviceProfileId, overrides }) => capture.setConfig(deviceProfileId, overrides),
    },
    getDefaultDevice: {
      input: noInput,
      output: z.unknown(),
      handler: () => capture.getDefaultDevice(),
    },
    setDefaultDevice: {
      input: nullableIdInput,
      output: z.unknown(),
      handler: ({ deviceId }) => capture.setDefaultDevice(deviceId),
    },
    findDefaultDevice: {
      input: noInput,
      output: z.unknown(),
      handler: () => capture.findDefaultDevice(),
    },
    captureImage: {
      input: captureRequestInput,
      output: z.unknown(),
      handler: ({ deviceId, imageFormat, resolutionIndex }) => capture.captureImage({
        deviceId,
        format: imageFormat,
        resolutionNum: resolutionIndex,
      }),
    },
    saveCapturedImage: {
      input: dataUrlInput,
      output: z.unknown(),
      handler: ({ imageDataUrl, imageExtension }) => capture.saveCapturedImage(imageDataUrl, imageExtension),
    },
    startPreview: {
      input: optionalDeviceInput,
      output: z.unknown(),
      handler: async (input, ctx) => {
        const resolved = input.deviceId
          ?? (await capture.findDefaultDevice() as { id?: string } | undefined)?.id
        if (!resolved) { throw new DomainRouteError('DEVICE_NOT_FOUND', '无可用采集设备') }
        return capture.startPreview(resolved, frame =>
          ctx.push?.('capture.frame', { deviceId: resolved, frame }))
      },
    },
    stopPreview: {
      input: requiredDeviceInput,
      output: z.unknown(),
      handler: ({ deviceId }) => capture.stopPreview(deviceId),
    },
    listDeviceCameras: {
      input: optionalDeviceInput,
      output: z.unknown(),
      handler: async ({ deviceId }) => {
        const resolved = deviceId
          ?? (await capture.findDefaultDevice() as { id?: string } | undefined)?.id
        if (!resolved) { throw new DomainRouteError('DEVICE_NOT_FOUND', '无可用采集设备') }
        return capture.listDeviceCameras(resolved)
      },
    },
    openCaptureDialog: {
      input: captureDialogInput,
      output: z.unknown(),
      handler: (input, ctx) => {
        const dialog = getDialog?.()
        if (!dialog) { throw new DomainRouteError('DOMAIN_UNAVAILABLE', '拍摄浮层未装配（平台未接入浮层宿主）') }
        if (!ctx.sender) { throw new DomainRouteError('PERMISSION_DENIED', '调用上下文缺少发起窗身份') }
        // Promise 挂起至浮层收场：确认=结果数组，取消=空数组，发起 tab 销毁自动作废
        return dialog.open(
          {
            deviceId: input.deviceId,
            deviceLabel: input.deviceLabel,
            resolutionNum: input.resolutionNum,
            title: input.title,
            format: input.format,
            maxCount: input.maxCount,
          },
          { wc: ctx.sender, appId: ctx.appId, appName: ctx.appName ?? ctx.appId },
        )
      },
    },
  }
}

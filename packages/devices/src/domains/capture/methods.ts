import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { CaptureSystem } from './index'
import { z } from 'zod'
import { DomainRouteError } from '../../domain-kit'
import {
  captureConfigInput,
  captureDialogInput,
  captureRequestInput,
  dataUrlInput,
  noInput,
  nullableIdInput,
  optionalDeviceInput,
  requiredDeviceInput,
} from '../input-schemas'

/** capture 域：高拍仪 / 摄像采集（预览帧经 ctx.push 点对点送达发起方窗口）。 */

export function createCaptureMethods(capture: CaptureSystem, deps: DomainDeps): DomainDefinition['methods'] {
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
        // 预览分辨率档位与快拍 resolutionIndex 同语义（camsdk/ws 通道消费；未带档位走设备默认）
        const opts = typeof (input as { resolutionNum?: unknown }).resolutionNum === 'number'
          ? { resolutionNum: (input as { resolutionNum: number }).resolutionNum }
          : undefined
        return capture.startPreview(resolved, frame =>
          ctx.push?.('capture.frame', { deviceId: resolved, frame }), opts)
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
      // 浮层预览帧与拍摄数据在浮层窗内闭环，不经发起方通道——原语域不参与该会话
      input: captureDialogInput,
      output: z.unknown(),
      handler: (input, ctx) => {
        if (!deps.captureDialog) { throw new DomainRouteError('DOMAIN_UNAVAILABLE', '拍摄浮层编排未装配（bootstrap 未启用 capture 能力）') }
        return deps.captureDialog(input, ctx)
      },
    },
  }
}

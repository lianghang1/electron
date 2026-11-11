import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
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

/** capture 域：高拍仪 / 摄像采集（预览帧经 EventBus 广播）。 */

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
      handler: async (input) => {
        const resolved = input.deviceId
          ?? (await capture.findDefaultDevice() as { id?: string } | undefined)?.id
        if (!resolved) { throw new DomainRouteError('DEVICE_NOT_FOUND', '无可用采集设备') }
        return capture.startPreview(resolved, frame =>
          deps.events.emit('capture.frame', { deviceId: resolved, frame }))
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
  }
}

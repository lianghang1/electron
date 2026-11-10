import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { CaptureSystem } from './index'
import { defineDomain } from '@shell/shared'
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
export function createCaptureDomain(capture: CaptureSystem, deps: DomainDeps): DomainDefinition {
  return defineDomain('capture', {
    listDevices: {
      input: noInput,
      output: z.unknown(),
      handler: () => capture.listDevices(),
    },
    listDeviceConfigs: {
      input: noInput,
      output: z.unknown(),
      handler: () => capture.getConfigs(),
    },
    setConfig: {
      input: captureConfigInput,
      output: z.unknown(),
      handler: ({ id, overrides }) => capture.setConfig(id, overrides),
    },
    getDefaultDevice: {
      input: noInput,
      output: z.unknown(),
      handler: () => capture.getDefaultDevice(),
    },
    setDefaultDevice: {
      input: nullableIdInput,
      output: z.unknown(),
      handler: ({ id }) => capture.setDefaultDevice(id),
    },
    findDefaultDevice: {
      input: noInput,
      output: z.unknown(),
      handler: () => capture.resolveDefaultDevice(),
    },
    captureImage: {
      input: captureRequestInput,
      output: z.unknown(),
      handler: input => capture.capture(input),
    },
    saveCapturedImage: {
      input: dataUrlInput,
      output: z.unknown(),
      handler: ({ dataUrl, ext }) => capture.saveDataUrl(dataUrl, ext),
    },
    startPreview: {
      input: optionalDeviceInput,
      output: z.unknown(),
      handler: async (input) => {
        const resolved = input.deviceId
          ?? (await capture.resolveDefaultDevice() as { id?: string } | undefined)?.id
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
          ?? (await capture.resolveDefaultDevice() as { id?: string } | undefined)?.id
        if (!resolved) { throw new DomainRouteError('DEVICE_NOT_FOUND', '无可用采集设备') }
        return capture.listCameras(resolved)
      },
    },
  })
}

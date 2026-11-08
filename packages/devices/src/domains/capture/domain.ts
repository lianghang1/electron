import type { DomainDefinition } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { CaptureSystem } from './index'
import { defineDomain } from '@shell/shared'
import { z } from 'zod'
import { DomainRouteError } from '../../domain-kit'

/** capture 域：高拍仪 / 摄像采集（预览帧经 EventBus 广播）。 */
export function createCaptureDomain(capture: CaptureSystem, deps: DomainDeps): DomainDefinition {
  return defineDomain('capture', {
    listDevices: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => capture.listDevices(),
    },
    getConfigs: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => capture.getConfigs(),
    },
    setConfig: {
      input: z.object({ id: z.string(), overrides: z.record(z.string(), z.unknown()) }),
      output: z.unknown(),
      handler: ({ id, overrides }) => capture.setConfig(id, overrides as never),
    },
    getDefaultDevice: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => capture.getDefaultDevice(),
    },
    setDefaultDevice: {
      input: z.object({ id: z.string().nullable() }),
      output: z.unknown(),
      handler: ({ id }) => capture.setDefaultDevice(id),
    },
    resolveDefaultDevice: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => capture.resolveDefaultDevice(),
    },
    capture: {
      input: z.object({}).passthrough(),
      output: z.unknown(),
      handler: input => capture.capture(input as never),
    },
    saveDataUrl: {
      input: z.object({ dataUrl: z.string(), ext: z.string().optional() }),
      output: z.unknown(),
      handler: ({ dataUrl, ext }) => capture.saveDataUrl(dataUrl, ext),
    },
    startPreview: {
      input: z.object({ deviceId: z.string().optional() }).passthrough(),
      output: z.unknown(),
      handler: async (input) => {
        const resolved = input.deviceId
          ?? (await capture.resolveDefaultDevice() as { id?: string } | undefined)?.id
        if (!resolved) { throw new DomainRouteError('DEVICE_NOT_FOUND', '无可用采集设备') }
        // 预览帧经 EventBus 广播（高频数据不进 invoke 通道）
        return capture.startPreview(resolved, frame =>
          deps.events.emit('capture.frame', { deviceId: resolved, frame }))
      },
    },
    stopPreview: {
      input: z.object({ deviceId: z.string() }),
      output: z.unknown(),
      handler: ({ deviceId }) => capture.stopPreview(deviceId),
    },
    listCameras: {
      input: z.object({ deviceId: z.string().optional() }),
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

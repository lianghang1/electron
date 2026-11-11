import type { DeviceObservation } from './runtime/telemetry'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createDomainRouter, DomainRouteError } from './domain-kit'
import { DeviceError } from './runtime/errors'
import { createDeviceTelemetry } from './runtime/telemetry'

const logger = { debug: vi.fn() }
const ctx = { appId: 'diagnostics', instanceId: 'i-1', log: () => {} }

const domains = [{
  name: 'print',
  methods: {
    submitPrintJob: {
      input: z.object({ printJobId: z.string() }),
      output: z.unknown(),
      handler: (input: { printJobId: string }) => ({ jobId: input.printJobId }),
    },
    clearPrintJobs: {
      input: z.undefined().optional(),
      output: z.unknown(),
      handler: () => { throw new DeviceError('CHANNEL_UNAVAILABLE', '通道不可用') },
    },
  },
}]

function observationCollector(): { published: DeviceObservation[], sink: { publish: (o: DeviceObservation) => void } } {
  const published: DeviceObservation[] = []
  return { published, sink: { publish: (o: DeviceObservation) => { published.push(o) } } }
}

describe('域路由观测打点', () => {
  it('成功调用记录 ok=true 并推单条与汇总快照', async () => {
    const telemetry = createDeviceTelemetry()
    const { published, sink } = observationCollector()
    const router = createDomainRouter(domains, logger, { telemetry, observation: sink })
    await expect(router.call('print.submitPrintJob', { printJobId: 'j1' }, ctx)).resolves.toEqual({ jobId: 'j1' })
    expect(telemetry.snapshot().calls).toBe(1)
    expect(telemetry.snapshot().failures).toBe(0)
    expect(telemetry.records()[0]).toMatchObject({
      capabilityId: 'print',
      methodName: 'submitPrintJob',
      appId: 'diagnostics',
      ok: true,
    })
    expect(published.filter(o => o.kind === 'call')).toHaveLength(1)
    expect(published.filter(o => o.kind === 'snapshot')).toHaveLength(1)
  })

  it('handler 抛设备错误时记录失败与错误码', async () => {
    const telemetry = createDeviceTelemetry()
    const router = createDomainRouter(domains, logger, { telemetry })
    await expect(router.call('print.clearPrintJobs', undefined, ctx)).rejects.toThrow(/通道不可用/)
    expect(telemetry.records()[0]).toMatchObject({ ok: false, errorCode: 'CHANNEL_UNAVAILABLE' })
    expect(telemetry.snapshot().byCapability.print.lastErrorCode).toBe('CHANNEL_UNAVAILABLE')
  })

  it('入参校验拒绝也打点，错误码为 INVALID_INPUT', async () => {
    const telemetry = createDeviceTelemetry()
    const router = createDomainRouter(domains, logger, { telemetry })
    await expect(router.call('print.submitPrintJob', {}, ctx)).rejects.toBeInstanceOf(DomainRouteError)
    expect(telemetry.records()[0]).toMatchObject({ ok: false, errorCode: 'INVALID_INPUT' })
  })

  it('能力闸门拒绝也打点，错误码为 DOMAIN_UNAVAILABLE', async () => {
    const telemetry = createDeviceTelemetry()
    const router = createDomainRouter(domains, logger, { telemetry, availableDomains: ['idcard'] })
    await expect(router.call('print.submitPrintJob', { printJobId: 'j1' }, ctx)).rejects.toBeInstanceOf(DomainRouteError)
    expect(telemetry.records()[0]).toMatchObject({ ok: false, errorCode: 'DOMAIN_UNAVAILABLE', capabilityId: 'print' })
  })

  it('未注册方法打点 METHOD_NOT_FOUND 并保留方法名', async () => {
    const telemetry = createDeviceTelemetry()
    const router = createDomainRouter(domains, logger, { telemetry })
    await expect(router.call('missing', undefined, ctx)).rejects.toBeInstanceOf(DomainRouteError)
    expect(telemetry.records()[0]).toMatchObject({ ok: false, errorCode: 'METHOD_NOT_FOUND', methodName: 'missing' })
  })

  it('授权拒绝打点 PERMISSION_DENIED', async () => {
    const telemetry = createDeviceTelemetry()
    const router = createDomainRouter(domains, logger, { telemetry, authorize: async () => false })
    await expect(router.call('print.submitPrintJob', { printJobId: 'j1' }, ctx)).rejects.toBeInstanceOf(DomainRouteError)
    expect(telemetry.records()[0].errorCode).toBe('PERMISSION_DENIED')
  })

  it('未注入观测底座时调用照常工作', async () => {
    const router = createDomainRouter(domains, logger)
    await expect(router.call('print.submitPrintJob', { printJobId: 'j1' }, ctx)).resolves.toEqual({ jobId: 'j1' })
  })
})

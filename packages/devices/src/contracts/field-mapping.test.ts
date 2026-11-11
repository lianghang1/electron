/**
 * P2-b 字段贯通测试：锁住「对外定稿字段 → 内部请求类型」的边界转换。
 *
 * defineDomain 的 handler 入参被推断为 any，typecheck 无法证明字段有没有对上；
 * 本测试用记录型桩调用真实 handler，断言传给各 System 的字段名与值逐项正确，
 * 防止「编译全绿但运行时读到 undefined」这类静默回归。
 */
import type { DomainCallContext } from '@shell/shared'
import type { DomainDeps } from '../domain-kit'
import { describe, expect, it } from 'vitest'
import { createCaptureDomain } from '../domains/capture/domain'
import { createIccardDomain } from '../domains/iccard/domain'
import { createIdcardDomain } from '../domains/idcard/domain'
import { createPrintDomain } from '../domains/print/domain'
import { createScannerDomain } from '../domains/scanner/domain'
import { createSignatureDomain } from '../domains/signature/domain'

interface Call { name: string, args: unknown[] }

/** 记录所有 System 方法调用；listDevices/findDefaultDevice 给出让 handler 走通的最小返回值。 */
function recorder(): { stub: unknown, calls: Call[] } {
  const calls: Call[] = []
  const stub = new Proxy({}, {
    get: (_target, name: string) => (...args: unknown[]) => {
      calls.push({ name, args })
      if (name === 'listDevices') { return Promise.resolve([{ id: 'r1', status: 'ready' }]) }
      if (name === 'findDefaultDevice') { return Promise.resolve(undefined) }
      return Promise.resolve({})
    },
  })
  return { stub, calls }
}

const ctx: DomainCallContext = { appId: 'test', instanceId: 'i', log() {} }
const deps: DomainDeps = {
  events: new Proxy({}, { get: () => () => {} }) as DomainDeps['events'],
  demoMode: { enabled: true },
}

function argsOf(calls: Call[], name: string): unknown[] {
  const hit = calls.filter(c => c.name === name).at(-1)
  expect(hit, `未调用 System.${name}`).toBeDefined()
  return hit?.args ?? []
}

function printDomain(stub: unknown) {
  return createPrintDomain(stub as Parameters<typeof createPrintDomain>[0])
}
function captureDomain(stub: unknown) {
  return createCaptureDomain(stub as Parameters<typeof createCaptureDomain>[0], deps)
}
function iccardDomain(stub: unknown) {
  return createIccardDomain(stub as Parameters<typeof createIccardDomain>[0])
}
function scannerDomain(stub: unknown) {
  return createScannerDomain(stub as Parameters<typeof createScannerDomain>[0], deps)
}

describe('对外字段 → 内部请求类型贯通', () => {
  it('print.submitPrintJob：printContent/printOptions → payload/options', async () => {
    const { stub, calls } = recorder()
    const def = printDomain(stub)
    const printContent = { kind: 'html', html: '<p>x</p>' }
    const printOptions = { paper: 'A4' }
    await def.methods.submitPrintJob.handler({ printContent, printOptions }, ctx)
    expect(argsOf(calls, 'submitPrintJob')[0]).toEqual({ payload: printContent, options: printOptions })
  })

  it('print 任务类方法：printJobId/maxCount 以值传递', async () => {
    const { stub, calls } = recorder()
    const def = printDomain(stub)
    await def.methods.getJobStatus.handler({ printJobId: 'j1' }, ctx)
    await def.methods.listPrintJobs.handler({ maxCount: 5 }, ctx)
    await def.methods.removePrintJob.handler({ printJobId: 'j2' }, ctx)
    await def.methods.reprintJob.handler({ printJobId: 'j3' }, ctx)
    expect(argsOf(calls, 'getJobStatus')[0]).toBe('j1')
    expect(argsOf(calls, 'listPrintJobs')[0]).toBe(5)
    expect(argsOf(calls, 'removePrintJob')[0]).toBe('j2')
    expect(argsOf(calls, 'reprintJob')[0]).toBe('j3')
  })

  it('capture.captureImage：imageFormat/resolutionIndex → format/resolutionNum', async () => {
    const { stub, calls } = recorder()
    const def = captureDomain(stub)
    await def.methods.captureImage.handler({ deviceId: 'd1', imageFormat: 'jpg', resolutionIndex: 2 }, ctx)
    expect(argsOf(calls, 'captureImage')[0]).toEqual({ deviceId: 'd1', format: 'jpg', resolutionNum: 2 })
  })

  it('capture.saveCapturedImage：imageDataUrl/imageExtension 以值传递', async () => {
    const { stub, calls } = recorder()
    const def = captureDomain(stub)
    await def.methods.saveCapturedImage.handler({ imageDataUrl: 'data:image/png;base64,AA', imageExtension: 'png' }, ctx)
    expect(argsOf(calls, 'saveCapturedImage')).toEqual(['data:image/png;base64,AA', 'png'])
  })

  it('capture.setDefaultDevice：deviceId 以值传递', async () => {
    const { stub, calls } = recorder()
    const def = captureDomain(stub)
    await def.methods.setDefaultDevice.handler({ deviceId: 'd1' }, ctx)
    expect(argsOf(calls, 'setDefaultDevice')).toEqual(['d1'])
  })

  it('四个 setConfig：deviceProfileId 以值传递', async () => {
    const input = { deviceProfileId: 'p1', overrides: {} }
    {
      const { stub, calls } = recorder()
      await createIdcardDomain(stub as Parameters<typeof createIdcardDomain>[0]).methods.setConfig.handler(input, ctx)
      expect(argsOf(calls, 'setConfig')[0]).toBe('p1')
    }
    {
      const { stub, calls } = recorder()
      await iccardDomain(stub).methods.setConfig.handler(input, ctx)
      expect(argsOf(calls, 'setConfig')[0]).toBe('p1')
    }
    {
      const { stub, calls } = recorder()
      await createSignatureDomain(stub as Parameters<typeof createSignatureDomain>[0], deps).methods.setConfig.handler(input, ctx)
      expect(argsOf(calls, 'setConfig')[0]).toBe('p1')
    }
    {
      const { stub, calls } = recorder()
      await captureDomain(stub).methods.setConfig.handler(input, ctx)
      expect(argsOf(calls, 'setConfig')[0]).toBe('p1')
    }
  })

  it('iccard.readSector：sectorKey/sectorNumber → key/sector', async () => {
    const { stub, calls } = recorder()
    const def = iccardDomain(stub)
    await def.methods.readSector.handler({ sectorNumber: 1, sectorKey: 'ffffffffffff', keyType: 'A' }, ctx)
    expect(argsOf(calls, 'readSector')[0]).toEqual({
      deviceId: 'r1',
      key: 'ffffffffffff',
      keyType: 'A',
      sector: 1,
    })
  })

  it('iccard.writeSector：blockNumber/blockData → block/data', async () => {
    const { stub, calls } = recorder()
    const def = iccardDomain(stub)
    const blockData = '0'.repeat(32)
    await def.methods.writeSector.handler({ blockNumber: 4, blockData }, ctx)
    expect(argsOf(calls, 'writeSector')[0]).toEqual({
      deviceId: 'r1',
      block: 4,
      data: blockData,
      key: undefined,
      keyType: undefined,
    })
  })

  it('iccard.writeTextBlocks：sectorNumber/textBlocks → sector/texts', async () => {
    const { stub, calls } = recorder()
    const def = iccardDomain(stub)
    await def.methods.writeTextBlocks.handler({ sectorNumber: 1, textBlocks: ['hello'] }, ctx)
    expect(argsOf(calls, 'writeTextBlocks')[0]).toEqual({
      deviceId: 'r1',
      sector: 1,
      texts: ['hello'],
      key: undefined,
      keyType: undefined,
    })
  })

  it('scanner.setConfig：activeProfileId → activeId', async () => {
    const { stub, calls } = recorder()
    const def = scannerDomain(stub)
    await def.methods.setConfig.handler({
      enabled: true,
      activeProfileId: 'a1',
      deviceId: 'd1',
      overrides: {},
    }, ctx)
    expect(argsOf(calls, 'setConfig')[0]).toEqual({
      enabled: true,
      activeId: 'a1',
      deviceId: 'd1',
      overrides: {},
    })
  })

  it('scanner.simulateScan：scannedCode 以值传递', async () => {
    const { stub, calls } = recorder()
    const def = scannerDomain(stub)
    await def.methods.simulateScan.handler({ scannedCode: 'EAN-1' }, ctx)
    expect(argsOf(calls, 'simulateScan')).toEqual(['EAN-1'])
  })
})

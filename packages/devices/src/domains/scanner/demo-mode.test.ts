import type { DomainCallContext } from '@shell/shared'
import type { DomainDeps } from '../../domain-kit'
import type { ScannerSystem } from './index'
import { describe, expect, it } from 'vitest'
import { createScannerMethods } from './methods'
import { SCANNER_DEFAULTS } from './service'

const ctx: DomainCallContext = { appId: 'test', instanceId: 'test', log: () => {} }

function deps(enabled: boolean): DomainDeps {
  return {
    events: new Proxy({}, { get: () => () => {} }) as DomainDeps['events'],
    demoMode: { enabled },
  }
}

function scannerStub(calls: string[]): ScannerSystem {
  return {
    attachWindow: () => {},
    getConfig: () => SCANNER_DEFAULTS,
    setConfig: () => SCANNER_DEFAULTS,
    simulate: (code: string) => {
      calls.push(code)
      return { code, prefix: null, rawCode: code, timestamp: 1 }
    },
    destroy: () => {},
  }
}

describe('扫码演示模式', () => {
  it('关闭时 simulateScan 被拒绝并给出开启指引', () => {
    const calls: string[] = []
    const methods = createScannerMethods(scannerStub(calls), deps(false))
    expect(() => methods.simulateScan.handler({ scannedCode: 'X' }, ctx)).toThrow(/演示模式未开启/)
    expect(calls).toEqual([])
  })

  it('运行时开启后 simulateScan 放行并走仿真链路', () => {
    const calls: string[] = []
    const state = deps(false)
    const methods = createScannerMethods(scannerStub(calls), state)
    state.demoMode.enabled = true
    const result = methods.simulateScan.handler({ scannedCode: 'EAN-1' }, ctx)
    expect(result).toMatchObject({ code: 'EAN-1' })
    expect(calls).toEqual(['EAN-1'])
  })

  it('共享状态对象使门禁与开关同源', () => {
    const calls: string[] = []
    const state = deps(true)
    const methods = createScannerMethods(scannerStub(calls), state)
    state.demoMode.enabled = false
    expect(() => methods.simulateScan.handler({ scannedCode: 'X' }, ctx)).toThrow(/演示模式未开启/)
    expect(calls).toEqual([])
  })
})

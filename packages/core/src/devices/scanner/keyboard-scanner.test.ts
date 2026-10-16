import type { ScanResult } from '@desktop/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeyboardScanner } from './keyboard-scanner'

type Result = Omit<ScanResult, 'timestamp'>

function create(opts: Partial<{ timeout: number, minLength: number, endKey: string, prefixes: string[], requirePrefix: boolean }> = {}) {
  const results: Result[] = []
  const scanner = new KeyboardScanner(
    { timeout: 100, minLength: 4, endKey: 'Enter', prefixes: [], requirePrefix: false, ...opts },
    (r) => {
      const { timestamp: _timestamp, ...rest } = r
      results.push(rest)
    },
  )
  return { scanner, results }
}

function type(scanner: KeyboardScanner, text: string): void {
  for (const ch of text) { scanner.addKey(ch) }
}

describe('keyboardScanner —— 结束键出码', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('缓冲 + Enter 结束 → 完整条码', () => {
    const { scanner, results } = create()
    type(scanner, 'ABC123')
    scanner.addKey('Enter')
    expect(results).toEqual([{ code: 'ABC123', prefix: null, rawCode: 'ABC123' }])
  })

  it('节奏超时（100ms 无按键）自动出码，无需 Enter', () => {
    const { scanner, results } = create()
    type(scanner, 'XYZ99')
    vi.advanceTimersByTime(100)
    expect(results).toEqual([{ code: 'XYZ99', prefix: null, rawCode: 'XYZ99' }])
  })

  it('缓冲不足 minLength 丢弃（超时路径）', () => {
    const { scanner, results } = create()
    type(scanner, 'ab')
    vi.advanceTimersByTime(100)
    expect(results).toEqual([])
  })

  it('缓冲不足 minLength 丢弃（结束键路径）', () => {
    const { scanner, results } = create()
    type(scanner, 'ab')
    scanner.addKey('Enter')
    expect(results).toEqual([])
  })

  it('修饰键等长按键被忽略（不污染缓冲）', () => {
    const { scanner, results } = create()
    type(scanner, 'ABC1')
    scanner.addKey('Shift')
    scanner.addKey('Control')
    scanner.addKey('Enter')
    expect(results).toEqual([{ code: 'ABC1', prefix: null, rawCode: 'ABC1' }])
  })

  it('人工输入节奏（按键间隔 > timeout）不产生条码', () => {
    const { scanner, results } = create()
    for (const ch of '1234') {
      scanner.addKey(ch)
      vi.advanceTimersByTime(300) // 人打字间隔远超 100ms，每次都被超时清掉
    }
    scanner.addKey('Enter')
    expect(results).toEqual([])
  })

  it('reset 清空缓冲与激活态', () => {
    const { scanner, results } = create()
    type(scanner, '123456')
    scanner.reset()
    scanner.addKey('Enter')
    expect(results).toEqual([])
  })
})

describe('keyboardScanner —— 前缀', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('命中前缀 → prefix 带 out，rawCode 去前缀', () => {
    const { scanner, results } = create({ prefixes: ['PB:', 'TK:'] })
    type(scanner, 'PB:00123')
    scanner.addKey('Enter')
    expect(results).toEqual([{ code: 'PB:00123', prefix: 'PB:', rawCode: '00123' }])
  })

  it('未命中前缀 → prefix 为 null，码原样通过', () => {
    const { scanner, results } = create({ prefixes: ['PB:'] })
    type(scanner, '99999')
    vi.advanceTimersByTime(100)
    expect(results).toEqual([{ code: '99999', prefix: null, rawCode: '99999' }])
  })

  it('requirePrefix=true 且未命中 → 丢弃', () => {
    const { scanner, results } = create({ prefixes: ['PB:'], requirePrefix: true })
    type(scanner, '99999')
    vi.advanceTimersByTime(100)
    expect(results).toEqual([])
  })
})

describe('keyboardScanner —— processComplete（模拟/外部接入）', () => {
  it('直接产出完整条码', () => {
    const { scanner, results } = create({ prefixes: ['PB:'] })
    scanner.processComplete('PB:778899')
    expect(results).toEqual([{ code: 'PB:778899', prefix: 'PB:', rawCode: '778899' }])
  })

  it('短于 minLength 忽略', () => {
    const { scanner, results } = create()
    scanner.processComplete('12')
    expect(results).toEqual([])
  })
})

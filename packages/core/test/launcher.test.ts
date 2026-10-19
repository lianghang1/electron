import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import Module from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// launcher 是 CJS 且经原生 require 加载 electron / original-fs（均为 Electron 内置，
// 纯 Node 下解析不到），vi.mock 拦不到原生 require——测试期在 Module._load 层桥接桩实现
let userDataDir = ''

const realRmSync = rmSync
const ModuleWithLoad = Module as unknown as {
  _load: (request: string, parent?: unknown, isMain?: boolean) => unknown
}
const originalModuleLoad = ModuleWithLoad._load
ModuleWithLoad._load = function patchedLoad(request, ...rest) {
  if (request === 'original-fs') {
    // node 环境无 asar 补丁，original-fs 行为与 fs 一致
    return { default: { rmSync: realRmSync }, rmSync: realRmSync }
  }
  if (request === 'electron') {
    return { app: { getPath: (_name: string) => userDataDir } }
  }
  // vite-node 下相对 require 的 parent 解析不可靠：launcher 的版本基准直接桥接到真实 package.json
  if (request === '../../package.json') {
    return JSON.parse(readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf-8'))
  }
  return originalModuleLoad.call(this, request, ...rest)
}

// BUILTIN_VERSION 取 packages/core/package.json 的 version（launcher 内 require('../../package.json')）
const { version: BUILTIN_VERSION } = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf-8'),
) as { version: string }

const { applyPending, compareVersions, scheduleStableClear, settleOrRollback } = await import('../launcher/out/main/index.cjs') as {
  applyPending: () => void
  compareVersions: (a: string, b: string) => number
  scheduleStableClear: () => void
  settleOrRollback: () => void
}

const updaterDir = () => path.join(userDataDir, 'desktop-updater')
const write = (name: string, content: string) => writeFileSync(path.join(updaterDir(), name), content)
const read = (name: string) => readFileSync(path.join(updaterDir(), name), 'utf-8')

beforeEach(() => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'launcher-test-'))
})

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

describe('compareVersions', () => {
  it('数字段逐段比较', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.2')).toBeLessThan(0)
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('缺段按 0 补齐：1.0 与 1.0.0 相等', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
  })

  it('预发布序：带预发布比同核心正式版更旧', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0)
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc')).toBeGreaterThan(0)
  })

  it('预发布标识符逐段比较：数值段比数值、数值 < 字母', () => {
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBeLessThan(0)
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBeLessThan(0)
  })

  it('构建元数据忽略，绝不返回 NaN（否则清单判定失效、每次启动重复下载）', () => {
    expect(compareVersions('1.0.0+build.1', '1.0.0')).toBe(0)
    expect(compareVersions('2.0.0-rc.1', '2.0.0-rc.1+build.2')).toBe(0)
    const diff = compareVersions('1.0.1-beta', '1.0.1')
    expect(Number.isNaN(diff)).toBe(false)
    expect(compareVersions('1.0.1-beta', '1.0.1-beta')).toBe(0)
  })

  it('核心数字段优先于预发布段', () => {
    expect(compareVersions('0.9.9', '1.0.0-rc.1')).toBeLessThan(0)
    expect(compareVersions('1.0.0-beta', '1.1.0')).toBeLessThan(0)
  })
})

describe('applyPending', () => {
  it('pending 与热更包齐备时切换 current 指针并清理标记', () => {
    mkdirSync(updaterDir(), { recursive: true })
    write('pending.json', JSON.stringify({ version: '9.9.9', file: 'core-9.9.9.asar', sha256: 'a'.repeat(64) }))
    write('core-9.9.9.asar', 'fake-asar')

    applyPending()

    const current = JSON.parse(read('current.json')) as { version: string, file: string }
    expect(current.version).toBe('9.9.9')
    expect(current.file).toBe('core-9.9.9.asar')
    expect(JSON.parse(read('first-run.json')).startedAt).toBeTypeOf('number')
    expect(existsSync(path.join(updaterDir(), 'pending.json'))).toBe(false)
  })

  it('热更包缺失时清 pending 不切指针', () => {
    mkdirSync(updaterDir(), { recursive: true })
    write('pending.json', JSON.stringify({ version: '9.9.9', file: 'core-9.9.9.asar', sha256: 'a'.repeat(64) }))

    applyPending()

    expect(existsSync(path.join(updaterDir(), 'pending.json'))).toBe(false)
    expect(existsSync(path.join(updaterDir(), 'current.json'))).toBe(false)
  })

  it('无 pending 时为空操作', () => {
    mkdirSync(updaterDir(), { recursive: true })
    applyPending()
    expect(existsSync(path.join(updaterDir(), 'current.json'))).toBe(false)
  })
})

describe('settleOrRollback', () => {
  it('first-run 标记仍在（上次未活过 60s）：回滚，判定不读墙钟', () => {
    mkdirSync(updaterDir(), { recursive: true })
    // startedAt 写成 10 天后的未来时间：证明存活判定只看文件存在性，与墙钟差无关
    write('first-run.json', JSON.stringify({ startedAt: Date.now() + 10 * 24 * 3600_000 }))
    write('current.json', JSON.stringify({ version: '9.9.9', file: 'core-9.9.9.asar', appliedAt: 1 }))
    write('core-9.9.9.asar', 'fake-asar')

    settleOrRollback()

    expect(existsSync(path.join(updaterDir(), 'current.json'))).toBe(false)
    expect(existsSync(path.join(updaterDir(), 'core-9.9.9.asar'))).toBe(false)
    expect(existsSync(path.join(updaterDir(), 'first-run.json'))).toBe(false)
  })

  it('first-run 标记已删（上次稳定存活）：保留指针与热更包', () => {
    mkdirSync(updaterDir(), { recursive: true })
    write('current.json', JSON.stringify({ version: '9.9.9', file: 'core-9.9.9.asar', appliedAt: 1 }))
    write('core-9.9.9.asar', 'current')
    write('core-9.9.8.asar', 'old')

    settleOrRollback()

    expect(existsSync(path.join(updaterDir(), 'current.json'))).toBe(true)
    expect(existsSync(path.join(updaterDir(), 'core-9.9.9.asar'))).toBe(true)
    expect(existsSync(path.join(updaterDir(), 'core-9.9.8.asar'))).toBe(true)
  })

  it('无 first-run 标记时空操作', () => {
    mkdirSync(updaterDir(), { recursive: true })
    write('current.json', JSON.stringify({ version: '9.9.9', file: 'core-9.9.9.asar', appliedAt: 1 }))
    write('core-9.9.9.asar', 'fake-asar')

    settleOrRollback()

    expect(existsSync(path.join(updaterDir(), 'current.json'))).toBe(true)
    expect(existsSync(path.join(updaterDir(), 'core-9.9.9.asar'))).toBe(true)
  })

  it('首次启动读取的 BUILTIN_VERSION 来自 core package.json', () => {
    // launcher 的版本基准经 require('../../package.json') 注入，与 core 版本一致才可参与比较
    expect(BUILTIN_VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(readdirSync(path.join(import.meta.dirname, '../launcher/out/main'))).toContain('index.cjs')
  })
})

describe('scheduleStableClear', () => {
  it('稳定计时（进程内 setTimeout）到期后删除 first-run 标记', () => {
    vi.useFakeTimers()
    try {
      mkdirSync(updaterDir(), { recursive: true })
      write('first-run.json', JSON.stringify({ startedAt: Date.now() }))

      scheduleStableClear()
      vi.advanceTimersByTime(59_999)
      expect(existsSync(path.join(updaterDir(), 'first-run.json'))).toBe(true)

      vi.advanceTimersByTime(1)
      expect(existsSync(path.join(updaterDir(), 'first-run.json'))).toBe(false)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('无 first-run 标记时稳定清理为安全空操作', () => {
    vi.useFakeTimers()
    try {
      mkdirSync(updaterDir(), { recursive: true })
      scheduleStableClear()
      expect(() => vi.advanceTimersByTime(60_000)).not.toThrow()
    }
    finally {
      vi.useRealTimers()
    }
  })
})

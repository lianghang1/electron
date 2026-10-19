import { readFileSync, rmSync } from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 引导器是 CJS 且经原生 require 加载 electron / original-fs（均为 Electron 内置，
// 纯 Node 下解析不到）——测试期在 Module._load 层桥接桩实现（同 launcher.test.ts）
const ModuleWithLoad = Module as unknown as {
  _load: (request: string, parent?: unknown, isMain?: boolean) => unknown
}
const originalModuleLoad = ModuleWithLoad._load
ModuleWithLoad._load = function patchedLoad(request, ...rest) {
  if (request === 'original-fs') {
    // node 环境无 asar 补丁，original-fs 行为与 fs 一致
    return { default: { rmSync }, rmSync }
  }
  if (request === 'electron') {
    return { app: { getPath: () => '/nonexistent' } }
  }
  if (request === '../../package.json') {
    return JSON.parse(readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf-8'))
  }
  return originalModuleLoad.call(this, request, ...rest)
}

// 双实现（TS 源码 / 引导器 CJS）必须逐向量一致：任一侧漂移即失败
const { compareVersions: tsCompare } = await import('../src/updater/version')
const { compareVersions: launcherCompare } = await import('../launcher/out/main/index.cjs') as {
  compareVersions: (a: string, b: string) => number
}

/** 一致性向量组：[a, b, 期望方向]（1 = a 更新，-1 = b 更新，0 = 相等） */
const VECTORS: Array<[string, string, 1 | -1 | 0]> = [
  // 等长数字段
  ['1.0.1', '1.0.0', 1],
  ['1.0.0', '1.0.2', -1],
  ['1.10.0', '1.9.0', 1],
  ['1.0.0', '1.0.0', 0],
  // 缺段补零
  ['1.0', '1.0.0', 0],
  ['1', '1.0.0', 0],
  // 预发布序：带预发布比同核心正式版更旧（T3 修复点）
  ['1.0.0-beta', '1.0.0', -1],
  ['1.0.0-alpha', '1.0.0-beta', -1],
  ['1.0.0-rc.1', '1.0.0-rc', 1],
  ['1.0.0-alpha.1', '1.0.0-alpha.beta', -1],
  // 预发布标识符：数值段比数值、数值 < 字母、段少者旧
  ['1.0.0-beta.2', '1.0.0-beta.11', -1],
  ['1.0.0-1', '1.0.0-alpha', -1],
  ['1.0.0-alpha', '1.0.0-alpha.1', -1],
  // 构建元数据忽略
  ['1.0.0+build.1', '1.0.0', 0],
  ['2.0.0-rc.1', '2.0.0-rc.1+build.2', 0],
  // 核心数字段优先于预发布段
  ['0.9.9', '1.0.0-rc.1', -1],
  ['1.0.0-beta', '1.1.0', -1],
  ['2.0.0-rc.1', '1.9.9', 1],
]

describe('compareVersions 双实现一致性（version.ts ↔ 引导器 CJS）', () => {
  it.each(VECTORS)('%s vs %s → %i', (a, b, expected) => {
    expect(sign(tsCompare(a, b))).toBe(expected)
    expect(sign(launcherCompare(a, b))).toBe(expected)
  })

  it('两实现均不返回 NaN', () => {
    for (const [a, b] of VECTORS) {
      expect(Number.isNaN(tsCompare(a, b))).toBe(false)
      expect(Number.isNaN(launcherCompare(a, b))).toBe(false)
    }
  })
})

function sign(value: number): 1 | -1 | 0 {
  if (value > 0) { return 1 }
  if (value < 0) { return -1 }
  return 0
}

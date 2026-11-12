import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { isRelevantAssetPlatform, planDriverAssets } from '../drivers/asset-layout.mjs'
import { auditDeviceAssets, collectAssetDeclarations, collectAssetSources } from './asset-audit'

/** devices 树真实源根（host/ 的上级即 devices/） */
const DEVICES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('collectAssetDeclarations（代码内资源声明枚举）', () => {
  it('覆盖驱动注册表 + capture 档案 + signature/print 常量', () => {
    const origins = collectAssetDeclarations().map(d => d.origin)
    expect(origins).toContain('idcard 驱动 huashi')
    expect(origins).toContain('idcard 驱动 kemi')
    expect(origins).toContain('iccard 驱动 decard')
    expect(origins).toContain('capture 档案 huashi-cvr100')
    expect(origins).toContain('signature 汉王')
    expect(origins).toContain('print SumatraPDF')
  })

  it('声明符合 devices/<域>/<厂商>/<平台>/<文件> 格式（print 无厂商层四段）', () => {
    for (const declaration of collectAssetDeclarations()) {
      const segments = declaration.file.split('/')
      expect(segments[0], declaration.origin).toBe('devices')
      expect([4, 5], declaration.origin).toContain(segments.length)
      // 倒数第二段 = 平台目录（win64/linux-arm64…）
      expect(segments.at(-2), declaration.origin).toMatch(/^(win64|linux-arm64)$/)
      for (const segment of segments) {
        expect(segment.length, declaration.origin).toBeGreaterThan(0)
      }
    }
  })
})

describe('auditDeviceAssets（仓库真实源对账）', () => {
  it('声明与源资产完全对齐：无非法 / 无缺失 / 无孤儿', () => {
    const result = auditDeviceAssets(DEVICES_ROOT)
    expect(result.invalid).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.orphans).toEqual([])
  })

  it('源资产覆盖全部已声明厂商（域/厂商双键）', () => {
    const targetRels = collectAssetSources(DEVICES_ROOT).map(s => s.targetRel)
    expect(targetRels).toEqual(expect.arrayContaining([
      'idcard/huashi',
      'idcard/kemi',
      'iccard/decard',
      'capture/huashi',
      'signature/hanvon',
      'print',
    ]))
  })
})

describe('auditDeviceAssets（缺失与孤儿检出）', () => {
  const fakeRoot = mkdtempSync(path.join(tmpdir(), 'device-assets-'))

  afterAll(() => {
    rmSync(fakeRoot, { recursive: true, force: true })
  })

  it('设备 SDK 缺失 → missing 区分「目录缺失」与「目录在但文件缺」', () => {
    // idcard/huashi 目录在但空（文件缺失），其余厂商整目录缺失
    mkdirSync(path.join(fakeRoot, 'idcard', 'vendors', 'huashi', 'assets', 'win64'), { recursive: true })

    const result = auditDeviceAssets(fakeRoot)
    const missingOrigins = result.missing.map(m => m.origin)
    expect(missingOrigins).toContain('idcard 驱动 huashi')
    expect(missingOrigins).toContain('idcard 驱动 kemi')
    expect(missingOrigins).toContain('print SumatraPDF')

    const huashiMissing = result.missing.find(m => m.origin === 'idcard 驱动 huashi')
    expect(huashiMissing?.file).toBe('devices/idcard/huashi/win64/Termb.dll')
    expect(huashiMissing?.expected).toBe('源资产缺失: idcard/huashi/assets/win64/Termb.dll')

    const kemiMissing = result.missing.find(m => m.origin === 'idcard 驱动 kemi')
    expect(kemiMissing?.expected).toBe('源资产不存在: idcard/kemi/win64/Termb.dll（核对域/厂商目录名）')
    expect(result.orphans).toEqual([])
  })

  it('厂商目录无声明引用 → orphans 报出（疑似改名后残留）', () => {
    mkdirSync(path.join(fakeRoot, 'iccard', 'vendors', 'huashi1', 'assets', 'win64'), { recursive: true })
    writeFileSync(path.join(fakeRoot, 'iccard', 'vendors', 'huashi1', 'assets', 'win64', 'Termb.dll'), '')

    const result = auditDeviceAssets(fakeRoot)
    expect(result.orphans).toContain('iccard/huashi1')
  })

  it('跨域同名厂商不互相污染：idcard/huashi 缺失不会因 capture/huashi 在位而误判通过', () => {
    // capture 域 huashi SDK 在位、idcard 域 huashi 缺失（域键隔离的直接验证）
    mkdirSync(path.join(fakeRoot, 'capture', 'vendors', 'huashi', 'assets', 'win64'), { recursive: true })
    writeFileSync(path.join(fakeRoot, 'capture', 'vendors', 'huashi', 'assets', 'win64', 'Termb.dll'), '')

    const result = auditDeviceAssets(fakeRoot)
    const huashiMissing = result.missing.find(m => m.origin === 'idcard 驱动 huashi')
    expect(huashiMissing).toBeDefined()
    expect(huashiMissing?.expected).toBe('源资产缺失: idcard/huashi/assets/win64/Termb.dll')
  })
})

describe('按目标平台裁剪驱动资产', () => {
  it('windows 保留 win 系列，mac/linux 排除 win 系列，缺省目标不过滤', () => {
    expect(isRelevantAssetPlatform('win64', 'win32')).toBe(true)
    expect(isRelevantAssetPlatform('win-arm64', 'win32')).toBe(true)
    expect(isRelevantAssetPlatform('mac-arm64', 'win32')).toBe(false)
    expect(isRelevantAssetPlatform('win64', 'darwin')).toBe(false)
    expect(isRelevantAssetPlatform('mac-arm64', 'darwin')).toBe(true)
    expect(isRelevantAssetPlatform('linux-arm64', 'linux')).toBe(true)
    expect(isRelevantAssetPlatform('win64', 'linux')).toBe(false)
    expect(isRelevantAssetPlatform('anything', undefined)).toBe(true)
    expect(isRelevantAssetPlatform('anything', 'unknown-os')).toBe(true)
  })

  it('聚合计划按目标平台过滤文件，开发态保留全部', () => {
    const all = planDriverAssets(DEVICES_ROOT)
    const exe = 'devices/print/win64/SumatraPDF.exe'
    expect(all.some(p => p.to === exe)).toBe(true)
    expect(planDriverAssets(DEVICES_ROOT, 'win32').some(p => p.to === exe)).toBe(true)
    const linux = planDriverAssets(DEVICES_ROOT, 'linux')
    expect(linux.some(p => p.to.includes('/win64/'))).toBe(false)
    expect(linux.length).toBeLessThan(all.length)
  })
})

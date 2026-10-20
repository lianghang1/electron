import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
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

  it('全部声明符合 devices/<厂商>/<平台>/<文件> 四段格式', () => {
    for (const declaration of collectAssetDeclarations()) {
      const segments = declaration.file.split('/')
      expect(segments, declaration.origin).toHaveLength(4)
      expect(segments[0], declaration.origin).toBe('devices')
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

  it('源资产覆盖全部已声明厂商', () => {
    const vendors = collectAssetSources(DEVICES_ROOT).map(s => s.vendor)
    expect(vendors).toEqual(expect.arrayContaining(['huashi', 'kemi', 'decard', 'hanvon', 'print']))
  })
})

describe('auditDeviceAssets（缺失与孤儿检出）', () => {
  const fakeRoot = mkdtempSync(path.join(tmpdir(), 'device-assets-'))

  afterAll(() => {
    rmSync(fakeRoot, { recursive: true, force: true })
  })

  it('设备 SDK 缺失 → missing 区分「目录缺失」与「目录在但文件缺」', () => {
    // huashi 目录在但空（文件缺失），其余厂商整目录缺失
    mkdirSync(path.join(fakeRoot, 'idcard', 'vendors', 'huashi', 'assets', 'win64'), { recursive: true })

    const result = auditDeviceAssets(fakeRoot)
    const missingOrigins = result.missing.map(m => m.origin)
    expect(missingOrigins).toContain('idcard 驱动 huashi')
    expect(missingOrigins).toContain('idcard 驱动 kemi')
    expect(missingOrigins).toContain('print SumatraPDF')

    const huashiMissing = result.missing.find(m => m.origin === 'idcard 驱动 huashi')
    expect(huashiMissing?.file).toBe('devices/huashi/win64/Termb.dll')
    expect(huashiMissing?.expected).toBe('源资产缺失: huashi/assets/win64/Termb.dll')

    const kemiMissing = result.missing.find(m => m.origin === 'idcard 驱动 kemi')
    expect(kemiMissing?.expected).toBe('assets 源目录不存在: kemi/')
    expect(result.orphans).toEqual([])
  })

  it('厂商目录无声明引用 → orphans 报出（疑似改名后残留）', () => {
    mkdirSync(path.join(fakeRoot, 'iccard', 'vendors', 'huashi1', 'assets', 'win64'), { recursive: true })
    writeFileSync(path.join(fakeRoot, 'iccard', 'vendors', 'huashi1', 'assets', 'win64', 'Termb.dll'), '')

    const result = auditDeviceAssets(fakeRoot)
    expect(result.orphans).toContain('huashi1')
  })
})

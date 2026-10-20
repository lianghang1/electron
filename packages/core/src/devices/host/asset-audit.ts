import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { BUILT_IN_CAPTURE_CONFIGS } from '../capture/configs'
import { SUMATRA_PDF_FILE } from '../print/sumatra'
import { HANVON_DLL_FILE } from '../signature/vendors/hanvon'
import { IC_DRIVERS, ID_DRIVERS } from './run'

/**
 * 设备 SDK 资产对账：驱动/协议档案声明的资源路径 ↔ devices 树 assets/ 源资产。
 *
 * 声明格式：devices/<厂商>/<平台>/<文件>（平台段如 win64，DLL 相对宿主资源根）。
 * 资产源：<devicesRoot>/**\/assets/<平台>/<文件>，assets 的父目录名 = 厂商名（分发目标目录名）。
 * 同步脚本（scripts/sync-dev-resources.ts）与单测（asset-audit.test.ts）共用本模块，
 * 保证「代码声明 ↔ 源资产」只有一套对账规则；目录名打错 / SDK 忘放在此暴露。
 */

/** 一条代码内资源声明（报错定位用 origin 标注来源） */
export interface AssetDeclaration {
  origin: string
  file: string
}

export interface AssetAuditResult {
  /** 声明路径不符合 devices/<厂商>/<平台>/<文件> 格式 */
  invalid: Array<AssetDeclaration & { reason: string }>
  /** 声明在源资产中不存在（SDK 漏放 / 厂商目录名打错） */
  missing: Array<AssetDeclaration & { expected: string }>
  /** 源资产中无任何声明引用的厂商目录（疑似改名后残留） */
  orphans: string[]
}

/** 源资产目录（assets 父目录名 = 厂商名，分发目标目录名） */
export interface AssetSource {
  vendor: string
  dir: string
}

/** 枚举全部代码内资源声明：idcard/iccard 驱动注册表 + capture 协议档案 + signature/print 常量 */
export function collectAssetDeclarations(): AssetDeclaration[] {
  const declarations: AssetDeclaration[] = []
  for (const [name, Ctor] of Object.entries(ID_DRIVERS)) {
    declarations.push({ origin: `idcard 驱动 ${name}`, file: new Ctor('').dllFile })
  }
  for (const [name, Ctor] of Object.entries(IC_DRIVERS)) {
    declarations.push({ origin: `iccard 驱动 ${name}`, file: new Ctor('').dllFile })
  }
  for (const config of BUILT_IN_CAPTURE_CONFIGS) {
    if (config.transport === 'dll' && config.dll) {
      declarations.push({ origin: `capture 档案 ${config.id}`, file: config.dll.file })
    }
  }
  declarations.push({ origin: 'signature 汉王', file: HANVON_DLL_FILE })
  declarations.push({ origin: 'print SumatraPDF', file: SUMATRA_PDF_FILE })
  return declarations
}

/** 扫描 devices 树全部 assets 源目录（父目录名 = 厂商名） */
export function collectAssetSources(devicesRoot: string): AssetSource[] {
  const sources: AssetSource[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const child = path.join(dir, entry.name)
      if (entry.name === 'assets') {
        sources.push({ vendor: path.basename(dir), dir: child })
        continue
      }
      walk(child)
    }
  }
  walk(devicesRoot)
  return sources
}

/** 解析声明路径 → { 厂商, 平台相对路径 }；格式非法返回 reason */
function parseDeclaration(file: string): { vendor: string, rel: string } | { reason: string } {
  const segments = file.split('/')
  if (segments.length !== 4 || segments[0] !== 'devices' || segments.some(s => s.length === 0)) {
    return { reason: '路径须为 devices/<厂商>/<平台>/<文件> 四段格式' }
  }
  return { vendor: segments[1], rel: `${segments[2]}/${segments[3]}` }
}

/** 构建厂商 → 平台文件相对路径集合 的源索引 */
function buildSourceIndex(devicesRoot: string): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  for (const source of collectAssetSources(devicesRoot)) {
    const files = index.get(source.vendor) ?? new Set<string>()
    for (const platform of readdirSync(source.dir, { withFileTypes: true })) {
      if (!platform.isDirectory()) {
        continue
      }
      for (const file of readdirSync(path.join(source.dir, platform.name))) {
        files.add(`${platform.name}/${file}`)
      }
    }
    index.set(source.vendor, files)
  }
  return index
}

/** 声明 ↔ 源资产全量对账（同步脚本与单测共用的单一规则） */
export function auditDeviceAssets(devicesRoot: string): AssetAuditResult {
  const declarations = collectAssetDeclarations()
  const index = buildSourceIndex(devicesRoot)
  const result: AssetAuditResult = { invalid: [], missing: [], orphans: [] }

  for (const declaration of declarations) {
    const parsed = parseDeclaration(declaration.file)
    if ('reason' in parsed) {
      result.invalid.push({ ...declaration, reason: parsed.reason })
      continue
    }
    const sourceFiles = index.get(parsed.vendor)
    if (!sourceFiles) {
      result.missing.push({ ...declaration, expected: `assets 源目录不存在: ${parsed.vendor}/` })
      continue
    }
    if (!sourceFiles.has(parsed.rel)) {
      result.missing.push({ ...declaration, expected: `源资产缺失: ${parsed.vendor}/assets/${parsed.rel}` })
    }
  }

  const declaredVendors = new Set(declarations.map(d => d.file.split('/')[1]).filter(Boolean))
  for (const vendor of index.keys()) {
    if (!declaredVendors.has(vendor)) {
      result.orphans.push(vendor)
    }
  }
  return result
}

/** 便捷断言：源文件真实存在（分发前对单文件的兜底） */
export function assetFileExists(dir: string, rel: string): boolean {
  return existsSync(path.join(dir, rel))
}

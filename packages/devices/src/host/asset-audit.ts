import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { CAPTURE_DLL_BINARIES } from '../capture/configs'
import { SUMATRA_PDF_FILE } from '../print/sumatra'
import { HANVON_DLL_FILE } from '../signature/vendors/hanvon'
import { IC_DRIVERS, ID_DRIVERS } from './run'

/**
 * 设备 SDK 资产对账：驱动/协议档案声明的资源路径 ↔ devices 树 assets/ 源资产。
 *
 * 声明格式：devices/<域>/<厂商>/<平台>/<文件>（print 无厂商层为 devices/print/<平台>/<文件>），
 * 即「源目录相对 devices 根的路径去掉 assets 段」——域 + 厂商双键命名空间，
 * 跨域同名厂商（不同公司撞名）不会互相污染。
 * 资产源：<devicesRoot>/**\/assets/<平台>/<文件>，assets 父目录名 = 厂商名；
 * 域名 = assets 相对 devices 根的第一层目录名；厂商与域同名时（print 形态）声明省略厂商段。
 * 同步脚本（scripts/sync-dev-resources.ts）与单测（asset-audit.test.ts）共用本模块，
 * 保证「代码声明 ↔ 源资产」只有一套对账规则；目录名打错 / SDK 忘放在此暴露。
 */

/** 一条代码内资源声明（报错定位用 origin 标注来源） */
export interface AssetDeclaration {
  origin: string
  file: string
}

export interface AssetAuditResult {
  /** 声明路径不符合 devices/<域>/[厂商/]<平台>/<文件> 格式 */
  invalid: Array<AssetDeclaration & { reason: string }>
  /** 声明在源资产中不存在（SDK 漏放 / 域或厂商目录名打错） */
  missing: Array<AssetDeclaration & { expected: string }>
  /** 源资产中无任何声明引用的域/厂商目录（疑似改名后残留） */
  orphans: string[]
}

/** 源资产目录（assets 父目录名 = 厂商名；targetRel = 产物相对 devices 根的子路径） */
export interface AssetSource {
  vendor: string
  dir: string
  /** 产物子路径：devices/<域>/<厂商>；厂商与域同名时为域本身（print 形态） */
  targetRel: string
}

/** 枚举全部代码内资源声明：idcard/iccard 驱动注册表 + capture DLL 注册表 + signature/print 常量 */
export function collectAssetDeclarations(): AssetDeclaration[] {
  const declarations: AssetDeclaration[] = []
  for (const [name, Ctor] of Object.entries(ID_DRIVERS)) {
    declarations.push({ origin: `idcard 驱动 ${name}`, file: new Ctor('').dllFile })
  }
  for (const [name, Ctor] of Object.entries(IC_DRIVERS)) {
    declarations.push({ origin: `iccard 驱动 ${name}`, file: new Ctor('').dllFile })
  }
  for (const [id, binary] of Object.entries(CAPTURE_DLL_BINARIES)) {
    declarations.push({ origin: `capture 档案 ${id}`, file: binary.file })
  }
  declarations.push({ origin: 'signature 汉王', file: HANVON_DLL_FILE })
  declarations.push({ origin: 'print SumatraPDF', file: SUMATRA_PDF_FILE })
  return declarations
}

/**
 * 扫描 devices 树全部 assets 源目录：assets 父目录名 = 厂商名，
 * 域名 = 相对 devices 根的第一层目录名，产物子路径 = <域>/<厂商>（同名合并为域名）。
 */
export function collectAssetSources(devicesRoot: string): AssetSource[] {
  const sources: AssetSource[] = []
  const walk = (dir: string, domain: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const child = path.join(dir, entry.name)
      if (entry.name === 'assets') {
        const vendor = path.basename(dir)
        sources.push({ vendor, dir: child, targetRel: domain === vendor ? domain : `${domain}/${vendor}` })
        continue
      }
      walk(child, domain || entry.name)
    }
  }
  walk(devicesRoot, '')
  return sources
}

/**
 * 构建产物子路径 → 平台/文件相对路径集合 的源索引。
 * 键为 targetRel（如 idcard/huashi、print），文件集如 { win64/Termb.dll }。
 */
function buildSourceIndex(devicesRoot: string): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  for (const source of collectAssetSources(devicesRoot)) {
    const files = index.get(source.targetRel) ?? new Set<string>()
    for (const platform of readdirSync(source.dir, { withFileTypes: true })) {
      if (!platform.isDirectory()) {
        continue
      }
      for (const file of readdirSync(path.join(source.dir, platform.name))) {
        files.add(`${platform.name}/${file}`)
      }
    }
    index.set(source.targetRel, files)
  }
  return index
}

/**
 * 声明 ↔ 源资产全量对账（同步脚本与单测共用的单一规则）。
 * 核验键 = 声明去 devices/ 前缀后的产物路径，按「域/厂商前缀 + 文件」两段匹配，
 * 域拼错或厂商拼错都会落进 missing 并给出期望源路径。
 */
export function auditDeviceAssets(devicesRoot: string): AssetAuditResult {
  const declarations = collectAssetDeclarations()
  const index = buildSourceIndex(devicesRoot)
  const result: AssetAuditResult = { invalid: [], missing: [], orphans: [] }

  for (const declaration of declarations) {
    const segments = declaration.file.split('/')
    if (segments[0] !== 'devices' || segments.length < 4 || segments.some(s => s.length === 0)) {
      result.invalid.push({ ...declaration, reason: '路径须为 devices/<域>/[厂商/]<平台>/<文件> 格式' })
      continue
    }
    const relPath = segments.slice(1).join('/')
    const targetRel = [...index.keys()].find(key => relPath.startsWith(`${key}/`))
    if (!targetRel) {
      result.missing.push({ ...declaration, expected: `源资产不存在: ${relPath}（核对域/厂商目录名）` })
      continue
    }
    const fileRel = relPath.slice(targetRel.length + 1)
    if (!index.get(targetRel)!.has(fileRel)) {
      result.missing.push({ ...declaration, expected: `源资产缺失: ${targetRel}/assets/${fileRel}` })
    }
  }

  const declaredRels = declarations.map(d => d.file.replace(/^devices\//, ''))
  for (const targetRel of index.keys()) {
    if (!declaredRels.some(rel => rel.startsWith(`${targetRel}/`))) {
      result.orphans.push(targetRel)
    }
  }
  return result
}

/** 便捷断言：源文件真实存在（分发前对单文件的兜底） */
export function assetFileExists(dir: string, rel: string): boolean {
  return existsSync(path.join(dir, rel))
}

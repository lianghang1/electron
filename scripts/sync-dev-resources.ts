import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { auditDeviceAssets, collectAssetSources } from '../packages/core/src/devices/host/asset-audit'

/**
 * 设备 SDK 资产同步（单向复制）：packages/core/src/devices/**\/assets/ 是厂商驱动文件
 * （DLL/license/SumatraPDF）的唯一真源，与消费它们的驱动代码同树演进；各应用的
 * resources/devices 是本脚本**覆盖式重建**的产物（源 → 应用，单向），postinstall 自动执行。
 *
 * 资产布局：assets 的父目录名 = 厂商名（分发目标目录名），assets 下按平台分目录
 * （win64/linux-arm64…），平台目录整体复制进产物——驱动声明路径为
 * devices/<域>/<厂商>/<平台>/<文件>（print 无厂商层为 devices/print/<平台>/<文件>），
 * 域 + 厂商双键命名空间隔离跨域同名厂商。
 *
 * 语义约定（曾有junction方案因"写入即回流根目录"的反直觉行为被否决）：
 * - 应用侧目录是再生成的产物，**不是**应用专属文件的位置——手工添加的文件会在下次同步时丢失
 * - 需要应用级设备差异时，扩展本脚本支持 override 层，而不是往应用侧手放文件
 * - 同步前先跑声明 ↔ 源对账（host/asset-audit）：目录名打错 / SDK 漏放 / 孤儿厂商目录直接报错终止
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEVICES_SRC = path.join(ROOT, 'packages', 'core', 'src', 'devices')
const APPS_DIR = path.join(ROOT, 'apps')

function listApps(): string[] {
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter(entry => existsSync(path.join(APPS_DIR, entry.name, 'package.json')))
    .map(entry => entry.name)
}

function listFiles(dir: string, base = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), rel) : [rel]
  })
}

function countFiles(dir: string): number {
  return listFiles(dir).length
}

/** 期望产物文件集（<域>/<厂商>/<平台>/<文件>），extras 警告与孤儿判断的基准 */
function expectedFiles(): Set<string> {
  const files = new Set<string>()
  for (const source of collectAssetSources(DEVICES_SRC)) {
    for (const rel of listFiles(source.dir)) {
      files.add(`${source.targetRel}/${rel}`)
    }
  }
  return files
}

/** 声明 ↔ 源对账：非法声明 / 缺失资产 / 孤儿厂商目录，任一存在即终止同步 */
function auditOrThrow(): void {
  const result = auditDeviceAssets(DEVICES_SRC)
  for (const item of result.invalid) {
    console.error(`  x ${item.origin}: ${item.file} —— ${item.reason}`)
  }
  for (const item of result.missing) {
    console.error(`  x ${item.origin}: ${item.file} —— ${item.expected}`)
  }
  for (const vendor of result.orphans) {
    console.error(`  x 源资产 ${vendor}/assets 无任何代码声明引用（疑似改名后残留）`)
  }
  if (result.invalid.length > 0 || result.missing.length > 0 || result.orphans.length > 0) {
    throw new Error('设备资源对账失败，请先修正上方问题再同步')
  }
}

/** 重建单个应用的 resources/devices（覆盖式：整体删除后从源复制） */
function rebuildApp(app: string, sources: Array<{ targetRel: string, dir: string }>, expected: Set<string>): void {
  const target = path.join(APPS_DIR, app, 'resources', 'devices')
  mkdirSync(path.dirname(target), { recursive: true })

  // 旧机制（junction）残留：链接只删自身，绝不递归穿透删除共享源
  const st = lstatSync(target, { throwIfNoEntry: false })
  if (st?.isSymbolicLink()) { rmSync(target) }

  // 单向复制语义：应用侧整体重建。手工放进去的额外文件（源没有的）会丢失，提前大声警告
  if (st?.isDirectory() && !st.isSymbolicLink()) {
    const extras = listFiles(target).filter(rel => !expected.has(rel))
    if (extras.length > 0) { console.warn(`  ! ${app}: 应用侧存在源资产没有的文件，本次同步将被清除：${extras.join('、')}`) }
  }

  rmSync(target, { recursive: true, force: true })
  for (const source of sources) {
    cpSync(source.dir, path.join(target, source.targetRel), { recursive: true })
  }
  console.log(`  + ${app}: resources/devices 已从源资产复制（${countFiles(target)} 个文件）`)
}

export function syncDevResources(apps: string[] = listApps()): void {
  auditOrThrow()
  const sources = collectAssetSources(DEVICES_SRC)
  if (sources.length === 0) { throw new Error(`未找到任何设备源资产目录: ${DEVICES_SRC}/**/assets`) }
  const expected = expectedFiles()

  for (const app of apps) {
    rebuildApp(app, sources, expected)
  }
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  try {
    syncDevResources()
  }
  catch (error) {
    console.error(`[sync-dev-resources] ${String(error)}`)
    process.exit(1)
  }
}

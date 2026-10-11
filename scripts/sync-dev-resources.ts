import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * 设备资源同步（单向复制）：根 resources/devices 是厂商驱动文件（DLL/license/SumatraPDF）的
 * 唯一真源，与消费它们的 packages/core 驱动代码同仓演进；各应用的 resources/devices 是
 * 本脚本**覆盖式重建**的产物（根 → 应用，单向），postinstall 自动执行。
 *
 * 语义约定（曾有junction方案因"写入即回流根目录"的反直觉行为被否决）：
 * - 应用侧目录是再生成的产物，**不是**应用专属文件的位置——手工添加的文件会在下次同步时丢失
 * - 需要应用级设备差异时，扩展本脚本支持 override 层，而不是往应用侧手放文件
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHARED_DEVICES = path.join(ROOT, 'resources', 'devices')
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

export function syncDevResources(apps: string[] = listApps()): void {
  if (!existsSync(SHARED_DEVICES))
    throw new Error(`共享设备资源不存在: ${SHARED_DEVICES}`)

  for (const app of apps) {
    const target = path.join(APPS_DIR, app, 'resources', 'devices')
    mkdirSync(path.dirname(target), { recursive: true })

    // 旧机制（junction）残留：链接只删自身，绝不递归穿透删除共享源
    const st = lstatSync(target, { throwIfNoEntry: false })
    if (st?.isSymbolicLink())
      rmSync(target)

    // 单向复制语义：应用侧整体重建。手工放进去的额外文件（共享源没有的）会丢失，提前大声警告
    if (st?.isDirectory() && !st.isSymbolicLink()) {
      const shared = new Set(listFiles(SHARED_DEVICES))
      const extras = listFiles(target).filter(rel => !shared.has(rel))
      if (extras.length > 0)
        console.warn(`  ! ${app}: 应用侧存在共享源没有的文件，本次同步将被清除：${extras.join('、')}`)
    }

    rmSync(target, { recursive: true, force: true })
    cpSync(SHARED_DEVICES, target, { recursive: true })
    console.log(`  + ${app}: resources/devices 已从共享源复制（${countFiles(target)} 个文件）`)
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

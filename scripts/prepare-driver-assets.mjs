/**
 * 驱动资产构建期聚合（源在源码树，产物在 resources/devices/）。
 *
 * 规则唯一来源：@shell/devices 的 planDriverAssets（与 asset-audit 共用 collectAssetSources）。
 * 声明格式 devices/<域>/<厂商>/<平台>/<文件> 与产物布局一一对应，
 * 因此 DriverResolver 的 assetRoot 只需指向 resources 根，域内部无需解析 dev/打包差异。
 *
 * 可用作 CLI：node scripts/prepare-driver-assets.mjs
 * 也可由打包配置直接调用 stageDriverAssets(root)（幂等，重复执行先清再建）。
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export async function stageDriverAssets(root = REPO_ROOT) {
  const src = join(root, 'packages/devices/src')
  const out = join(root, 'resources/devices')
  // 规则模块是源码树里的纯 ESM（.mjs），Node 直接加载，无 dist 前置构建
  const { planDriverAssets } = await import('../packages/devices/src/drivers/asset-layout.mjs')
  const plans = planDriverAssets(src)

  rmSync(out, { recursive: true, force: true })
  for (const plan of plans) {
    const dest = join(out, plan.to.replace(/^devices\//, ''))
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(plan.from, dest)
  }
  return { files: plans.length, out }
}

/** 打包配置显式调用，保证产物先于 extraResources 就位 */
export async function ensureDriverAssets(root = REPO_ROOT) {
  const { files } = await stageDriverAssets(root)
  process.stdout.write(`[driver-assets] staged ${files} files → resources/devices/\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  ensureDriverAssets().catch((err) => {
    process.stderr.write(`[driver-assets] ${String(err)}\n`)
    process.exitCode = 1
  })
}

/** 供配置侧快速判断（打包时目录不存在会报错，脚本已保证存在） */
export function driverAssetsReady(root = REPO_ROOT) {
  return existsSync(join(root, 'resources/devices'))
}

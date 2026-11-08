import { readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * 驱动资产布局：唯一规则源（纯 ESM，Node 与 Vite 都能直接加载，无需构建）。
 * 源：<devicesRoot>/domains/<域>/[vendors/]<厂商>/assets/<平台>/<文件>
 * 产物：devices/<域>/<厂商>/<平台>/<文件>（厂商与域同名时省略厂商层，print 形态）
 *
 * 域内 DLL 声明、asset-audit 对账、构建期聚合三处共用本规则——
 * 类型由同目录 asset-layout.d.mts 提供（TS 侧 import 不带扩展名即可）。
 */

/** 枚举 devices 树全部 assets 源目录（纯 fs，无副作用） */
export function collectAssetSources(devicesRoot) {
  const sources = []
  const walk = (dir, domain) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) { continue }
      const child = path.join(dir, entry.name)
      if (entry.name === 'assets') {
        const vendor = path.basename(dir)
        sources.push({ vendor, dir: child, targetRel: domain === vendor ? domain : `${domain}/${vendor}` })
        continue
      }
      if (domain === '' && (entry.name === 'src' || entry.name === 'domains')) {
        walk(child, '')
        continue
      }
      walk(child, domain || entry.name)
    }
  }
  walk(devicesRoot, '')
  return sources
}

/** 构建期资产聚合计划：源 assets/<平台>/<文件> → devices/<targetRel>/<平台>/<文件> */
export function planDriverAssets(devicesRoot) {
  const plans = []
  for (const source of collectAssetSources(devicesRoot)) {
    for (const platform of readdirSync(source.dir, { withFileTypes: true })) {
      if (!platform.isDirectory()) { continue }
      for (const file of readdirSync(path.join(source.dir, platform.name))) {
        plans.push({
          from: path.join(source.dir, platform.name, file),
          to: ['devices', source.targetRel, platform.name, file].join('/'),
        })
      }
    }
  }
  return plans
}

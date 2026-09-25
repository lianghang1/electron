/**
 * electron-builder afterPack：asar 热更引导器结构改造。
 *
 * 产物结构（mac/linux/win 通用）：
 *   resources/app.asar      ← electron-builder 产物（真实全量代码）→ 改名为 app.core.asar
 *   resources/app.asar      ← 重新写入 KB 级引导器（build/launcher/ 源码，CJS，永不更新）
 *
 * 引导器在启动早期动态加载 app.core.asar（或 userData 热更包），见 build/launcher/main.cjs。
 */
const fs = require('node:fs')
const path = require('node:path')

exports.default = async function afterPack(context) {
  const resourcesDir = path.join(context.appOutDir, 'resources')
  const asarPath = path.join(resourcesDir, 'app.asar')
  const corePath = path.join(resourcesDir, 'app.core.asar')
  const launcherDir = path.join(context.packager.projectDir, 'build', 'launcher')

  // 1. 真实代码包改名（保留 out/ 布局，引导器按 out/main/index.js 加载）
  fs.renameSync(asarPath, corePath)

  // 2. 生成引导器 asar 写入 app.asar
  const asar = require('@electron/asar')
  await asar.createPackage(launcherDir, asarPath)

  const coreSize = fs.statSync(corePath).size
  const launcherSize = fs.statSync(asarPath).size
  console.log(`  • launcher structure ready: app.asar=${launcherSize}B, app.core.asar=${coreSize}B`)
}

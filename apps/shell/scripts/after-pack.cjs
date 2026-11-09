const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')

/**
 * electron-builder afterPack：把完整产物拆成「薄壳引导器 + 真实代码包」。
 * 源码依据 master packages/core/scripts/after-pack.cjs；差异是引导器为 ESM（index.mjs），
 * 且核心入口通过 boot({ artifactRoot }) 显式注入产物根，不再从 __dirname 推路径。
 *
 * 产物布局：
 *   resources/app.asar       KB 级引导器（永不热更）
 *   resources/app.core.asar  electron-builder 原产物改名（out/ 布局完整保留）
 *   resources/resources/.resources-version  内置 resources 版本基准
 *   resources/node_modules/koffi            原生依赖，随整包落地，热更包禁止携带
 */
exports.default = async function afterPack(context) {
  const resourcesDir = path.join(context.appOutDir, 'resources')
  const asarPath = path.join(resourcesDir, 'app.asar')
  const corePath = path.join(resourcesDir, 'app.core.asar')
  const launcherSource = path.join(__dirname, '..', 'electron', 'launcher')

  fs.renameSync(asarPath, corePath)

  const info = context.packager.appInfo
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-launcher-'))
  try {
    // electron-builder 的 sanityCheckPackage 按项目 main 校验 app.asar/out/main/index.js，
    // 引导器必须落在同一路径；薄壳 package.json 声明 type:module 让 .js 走 ESM 加载。
    const outMain = path.join(staging, 'out', 'main')
    fs.mkdirSync(outMain, { recursive: true })
    for (const name of fs.readdirSync(launcherSource)) {
      if (!name.endsWith('.mjs')) { continue }
      const dest = name === 'index.mjs' ? 'index.js' : name
      fs.copyFileSync(path.join(launcherSource, name), path.join(outMain, dest))
    }
    fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify({
      name: info.name,
      productName: info.productName,
      version: info.version,
      private: true,
      type: 'module',
      main: 'out/main/index.js',
    }, null, 2))

    const asar = require('@electron/asar')
    await asar.createPackage(staging, asarPath)
  }
  finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }

  copyKoffi(context.packager.projectDir || process.cwd(), resourcesDir)

  const markerDir = path.join(resourcesDir, 'resources')
  fs.mkdirSync(markerDir, { recursive: true })
  fs.writeFileSync(path.join(markerDir, '.resources-version'), info.version)

  console.log(`  • launcher structure ready (${info.name}@${info.version}): app.asar=${fs.statSync(asarPath).size}B, app.core.asar=${fs.statSync(corePath).size}B`)
}

/** koffi 的 .node 必须落 asar 外真实目录：asar 内无法 dlopen，热更包在 userData 更解析不到安装目录 */
function copyKoffi(projectDir, resourcesDir) {
  let koffiEntry
  try {
    koffiEntry = require.resolve('koffi', { paths: [projectDir, __dirname] })
  }
  catch {
    console.warn('  • koffi not installed, skip asar-external distribution')
    return
  }
  const koffiDir = path.dirname(koffiEntry)
  const targetDir = path.join(resourcesDir, 'node_modules', 'koffi')
  fs.cpSync(koffiDir, targetDir, { recursive: true, dereference: true })

  const triplet = `${process.platform}_${process.arch}`
  const distPackage = `@koromix/koffi-${process.platform}-${process.arch}`
  const nodeSrc = path.join(path.dirname(koffiDir), distPackage, triplet, 'koffi.node')
  if (!fs.existsSync(nodeSrc)) {
    console.warn(`  • koffi platform binary missing (${distPackage}), packaged DLL devices unavailable`)
    return
  }
  const nodeDest = path.join(targetDir, 'build', triplet)
  fs.mkdirSync(nodeDest, { recursive: true })
  fs.copyFileSync(nodeSrc, path.join(nodeDest, 'koffi.node'))
}

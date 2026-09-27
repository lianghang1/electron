/**
 * electron-builder afterPack：asar 热更引导器结构改造（全 app 共享，desktop/kiosk/hospital/funeral 通用）。
 *
 * 产物结构（三平台通用）：
 *   resources/app.asar      ← 重写为 KB 级引导器（packages/core/launcher，CJS，永不更新）
 *   resources/app.core.asar ← electron-builder 产物（真实全量代码）改名而来
 *
 * 引导器 asar 内的 package.json 按当前 app 的打包元数据动态生成：
 *   - name        决定 userData 目录（热更指针/日志落点），必须与 app 一致
 *   - version     决定 app.getVersion()（AsarUpdateService 的内置版本基准），必须与 app 一致
 *   - productName 决定进程显示名
 * 引导器启动早期动态加载 app.core.asar 或 userData 热更包（见 launcher/out/main/index.js）。
 *
 * 接入方式：app 的 electron-builder.yml 配 afterPack: ../../packages/core/scripts/after-pack.cjs
 * （electron-builder 钩子仅支持相对 projectDir 的路径，无法走包名解析，../../ 属构建机制限制）
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

exports.default = async function afterPack(context) {
  const resourcesDir = path.join(context.appOutDir, 'resources')
  const asarPath = path.join(resourcesDir, 'app.asar')
  const corePath = path.join(resourcesDir, 'app.core.asar')
  // 共享引导器源码与本钩子同包：packages/core/{launcher,scripts}
  const launcherSource = path.join(__dirname, '..', 'launcher')

  // 1. 真实代码包改名（保留 out/ 布局，引导器按 out/main/index.js 加载）
  fs.renameSync(asarPath, corePath)

  // 2. 动态组装引导器目录：共享 index.js + 按 app 元数据生成的 package.json
  const info = context.packager.appInfo
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-launcher-'))
  try {
    fs.cpSync(launcherSource, staging, { recursive: true })
    fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify({
      name: info.name,
      productName: info.productName,
      version: info.version,
      private: true,
      main: 'out/main/index.js',
    }, null, 2))

    // 3. 打成 KB 级引导器 asar
    const asar = require('@electron/asar')
    await asar.createPackage(staging, asarPath)
  }
  finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }

  const coreSize = fs.statSync(corePath).size
  const launcherSize = fs.statSync(asarPath).size
  console.log(`  • launcher structure ready (${info.name}@${info.version}): app.asar=${launcherSize}B, app.core.asar=${coreSize}B`)
}

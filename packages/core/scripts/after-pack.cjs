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
 * 接入方式：app 的 electron-builder.cjs 配 afterPack: 'scripts/after-pack.cjs'（薄壳），
 * 薄壳经包名 require 本文件；electron-builder 校验钩子路径必须在 projectDir 内，无法直接引用包外路径。
 *
 * 架构契约（改动打包配置前必读）：
 * 1. app.core.asar 必须保持"纯 JS"：.node 原生库、可执行文件、LoadLibrary 目标一律不得打进 asar。
 *    electron-builder 对原生依赖的 smartUnpack 产物目录固定叫 app.asar.unpacked，与本钩子的改名
 *    app.core.asar 对不上；热更包下载到 userData 后更无法携带 unpacked 目录——因此 asarUnpack
 *    必须永远保持未配置，原生依赖（koffi 等）走本钩子的 asar 外分发。
 * 2. 主进程/渲染层 bundle 必须自包含（共享 vite 工厂不做依赖外部化），files 由此整体排除
 *    node_modules——这同时规避了依赖收集器在 pnpm 下的不确定行为（曾把 devDep 与全字体包收进 asar）。
 * 3. 热更包只换代码：resources/（厂商 DLL、SumatraPDF、内置 App 页面）变化必须走整包更新。
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')

exports.default = async function afterPack(context) {
  const resourcesDir = path.join(context.appOutDir, 'resources')
  const asarPath = path.join(resourcesDir, 'app.asar')
  const corePath = path.join(resourcesDir, 'app.core.asar')
  // 共享引导器源码与本钩子同包：packages/core/{launcher,scripts}
  const launcherSource = path.join(__dirname, '..', 'launcher')

  // 1. 真实代码包改名（保留 out/ 布局，引导器按 out/main/index.cjs 加载）
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
      // 引导器入口与真实代码包入口均为 CJS .cjs（共享 vite 工厂统一输出格式；
      // electron-builder 按此路径校验 afterPack 重写后的引导器 asar）
      main: 'out/main/index.cjs',
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

  // 4. koffi（FFI，原生模块）asar 外分发，运行时由 devices/kernel/koffi 访问器显式锚定
  copyKoffi(context.packager.projectDir || process.cwd(), resourcesDir)

  // 5. resources 版本标记：热更协议 minResourcesVersion 的比对基准（热更只换代码，热更代码
  //    依赖新版 resources 能力时由 AsarUpdateService 据此拒绝旧 resources 设备的热更）
  const markerDir = path.join(resourcesDir, 'resources')
  fs.mkdirSync(markerDir, { recursive: true })
  fs.writeFileSync(path.join(markerDir, '.resources-version'), info.version)
}

/**
 * 把 koffi 拷到 <resourcesPath>/node_modules/koffi（跟整包更新，永不随热更 asar 变化）：
 * - koffi JS 整包：运行时访问器 require 该目录；
 * - 平台二进制：从 @koromix/koffi-<平台> 分发包取 <triplet>/koffi.node，落到
 *   koffi/node_modules 下的 build/<triplet>/——命中 koffi loadDynamic 的
 *   process.resourcesPath + "/node_modules/koffi/build" 探测根（.node 必须是真实文件，
 *   asar 内无法 dlopen；且热更 asar 在 userData、解析链走不到安装目录，故必须显式锚定）。
 * pnpm 下 node_modules 内是符号链接，dereference:true 拷入真实内容；可选依赖缺失时跳过。
 */
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

  // koffi 二进制来自平台分发包 @koromix/koffi-<platform>-<arch>（triplet 同 koffi 源码 detectPlatform）
  const triplet = `${process.platform}_${process.arch}`
  const distPackage = `@koromix/koffi-${process.platform}-${process.arch}`
  const nodeSrc = path.join(path.dirname(koffiDir), distPackage, triplet, 'koffi.node')
  if (!fs.existsSync(nodeSrc)) {
    console.warn(`  • WARNING: koffi 平台二进制缺失（${distPackage} 未安装或无 ${triplet}/koffi.node），打包版 DLL 设备将不可用`)
    return
  }
  const nodeDest = path.join(targetDir, 'build', triplet)
  fs.mkdirSync(nodeDest, { recursive: true })
  fs.copyFileSync(nodeSrc, path.join(nodeDest, 'koffi.node'))
  console.log(`  • koffi distributed to resources/node_modules/koffi (${triplet})`)
}

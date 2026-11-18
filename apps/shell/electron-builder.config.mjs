/**
 * 壳平台打包配置（flavor 驱动：一套壳 × N 产品，零代码差异）。
 * 用 JS 配置而非 yml + ${env.*}：electron-builder 26 的 yml 环境插值对
 * productName / 安装目录不生效（fpm 收到字面量），代码配置无此问题。
 * 默认只发现 electron-builder.{yml,yaml,json,json5,toml,js,cjs,ts}，不认 .mjs，
 * 故由 build:* 脚本显式 --config 传入。
 *
 * 用法：FLAVOR=<id> pnpm build:win（不设 FLAVOR 默认 solo-demo）
 * flavor 清单经 electron-vite main define 编译进 bundle（见 electron.vite.config.ts），
 * resources/ 不携带 flavor.json——打包配置与内嵌值的一致性由构建标记机器校验，见下方 fail-fast
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { ensureDriverAssets } from '../../scripts/prepare-driver-assets.mjs'

const flavorId = process.env.FLAVOR ?? 'solo-demo'
const flavor = JSON.parse(readFileSync(new URL(`../../apps/flavors/${flavorId}/flavor.json`, import.meta.url), 'utf-8'))

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

// 一致性闸门：bundle 内嵌的 flavor（electron.vite build 时落标记）与打包配置的 FLAVOR 相同才放行。
// 忘设 FLAVOR 时 vite 侧内嵌 devconsole、builder 缺省 solo-demo——在此拦截而不是装出错配包。
const markerPath = join(repoRoot, 'apps/shell/out/flavor-build-marker.json')
const marker = existsSync(markerPath) ? JSON.parse(readFileSync(markerPath, 'utf-8')) : null
if (marker?.flavorId !== flavorId) {
  throw new Error(`FLAVOR=${flavorId} 与 bundle 内嵌 flavor（${marker?.flavorId ?? '无构建标记，先跑 pnpm build'}）不一致：以同一 FLAVOR 重跑 build:win`)
}

/**
 * 构建目标矩阵（update/<platform>/<arch> 契约）：win/mac/linux × x64/arm64 共 6 端，
 * 飞腾/鲲鹏落 arm64，兆芯/海光落 x64。龙芯/申威无 Electron 官方二进制，不在矩阵内。
 * 不做 CI：逐端由 TARGET_OS / TARGET_ARCH 指定，在对应平台机器上构建并人工核对产物。
 */
const BUILD_MATRIX = {
  win32: ['x64', 'arm64'],
  darwin: ['x64', 'arm64'],
  linux: ['x64', 'arm64'],
}
const targetOs = process.env.TARGET_OS ?? process.platform
const targetArch = process.env.TARGET_ARCH ?? process.arch
if (!BUILD_MATRIX[targetOs]?.includes(targetArch)) {
  throw new Error(`unsupported build target: ${targetOs}/${targetArch}`)
}
const arch = [targetArch]

// 构建期把源码树 assets 按同一套规则聚合成 resources/devices/<域>/<厂商>/<平台>/<文件>，
// 使 bundled 策略的 <resources>/devices/... 与域内声明一一对应（不在 asar 内散落携带 DLL）。
// 按目标平台裁剪：Windows 产物不携带非 win 资产，mac/linux 产物不携带 win 系列 DLL/exe。
await ensureDriverAssets(repoRoot, targetOs)

// rpm 需 rpmbuild，逐端构建时由 TARGET_RPM=1 显式启用；默认 deb + AppImage 保证任意
// 干净的 Linux 环境都能完成打包，国产化 rpm 产物在装有 rpmbuild 的机器上产出
const linuxTargets = process.env.TARGET_RPM === '1' ? ['deb', 'AppImage', 'rpm'] : ['deb', 'AppImage']

// 应用目录按 flavor 声明裁剪：只有 flavor.apps 列出的应用入包——调试台/测试页签只属于
// 对应 dev flavor，生产 flavor（solo/kiosk）天然不携带；远程应用无本地目录，存在性过滤
const appResourceEntries = flavor.apps
  .filter(app => existsSync(join(repoRoot, 'resources/apps', app.id)))
  .map(app => ({ from: join(repoRoot, 'resources/apps', app.id), to: `apps/${app.id}` }))

const config = {
  appId: `cn.shellplatform.${flavor.id}`,
  productName: flavor.name,
  // 不显式指定会落到 package.json 的 name(@app/shell)，产物变成 "@appshell"
  executableName: flavor.id,
  artifactName: `${flavor.id}-\${version}-${targetOs}-${targetArch}.\${ext}`,
  directories: {
    output: `release/${flavor.id}`,
    buildResources: 'build',
  },

  files: ['out/**'],
  // 不跑 @electron/rebuild：壳无源码编译需求（koffi 是 NAPI 模块，经 afterPack 拆包落
  // resources/，无需 ABI rebuild）；且 pnpm 符号链接 node_modules 会让 rebuild 的依赖
  // 树计算撞上仅存在于 .pnpm 虚拟存储的传递依赖（stat ENOENT，如 @quansync/fs）
  npmRebuild: false,
  // 拆包钩子：app.asar 重写为 KB 级 ESM 引导器，完整产物改名 app.core.asar；
  // koffi 原生依赖与 resources 版本标记随整包落 resources/（热更包禁止携带 .node）
  afterPack: './scripts/after-pack.cjs',

  extraResources: [
    // 应用 dist（packaged 形态）：按 flavor 声明裁剪，仅打包 flavors 声明的应用目录
    ...appResourceEntries,
    // 驱动资产：构建期聚合产物注入 resources/devices/，声明 devices/<域>/... 直接命中。
    // system 部署（mac/linux）不携带 DLL，manual 部署（信创）从现场数据目录取，见 docs/driver-packaging.md。
    { from: '../../resources/devices', to: 'devices' },
    // 托盘品牌图标：组合根打包态从 resources/branding 取（dev 直取 apps/shell/build/）
    { from: '../../apps/shell/build/icon.png', to: 'branding/icon.png' },
  ],

  win: {
    target: [{ target: 'nsis', arch }],
    // win32-arm64 走同一 NSIS 配置；国产化 CPU 由 linux 侧承担，见 docs/release.md
  },

  nsis: {
    oneClick: false,
    // 静默参数（/S --updated）由 Win32Installer 拉起，--updated 触发 electron-builder 的
    // KeepShortcuts：覆盖安装不重建用户已删除的快捷方式，也不改动固定身份
    allowToChangeInstallationDirectory: false,
    perMachine: true,
    deleteAppDataOnUninstall: false,
  },

  mac: {
    target: [{ target: 'dmg', arch }],
    category: 'public.app-category.business',
  },

  linux: {
    target: linuxTargets.map(target => ({ target, arch })),
    category: 'Utility',
  },
}

// deb/rpm 的包名字段要求以字母数字开头：产品名（中文）只进桌面元数据，
// 包身份用 flavor.id，多 flavor 同机安装互不冲突（顶层键，schema 在 linux 之外）
config.deb = { packageName: flavor.id }
config.rpm = { packageName: flavor.id }

export default config

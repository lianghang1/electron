/**
 * 壳平台打包配置（flavor 驱动：一套壳 × N 产品，零代码差异）。
 * 用 JS 配置而非 yml + ${env.*}：electron-builder 26 的 yml 环境插值对
 * productName / 安装目录不生效（fpm 收到字面量），代码配置无此问题。
 * 默认只发现 electron-builder.{yml,yaml,json,json5,toml,js,cjs,ts}，不认 .mjs，
 * 故由 build:* 脚本显式 --config 传入。
 *
 * 用法：FLAVOR=update-e2e pnpm build:linux（不设 FLAVOR 默认 cemetery）
 * 打包态组合根读取 <resources>/flavor.json（extraResources 注入，见 main/index.ts loadFlavor）
 */
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { ensureDriverAssets } from '../../scripts/prepare-driver-assets.mjs'

const flavorId = process.env.FLAVOR ?? 'cemetery'
const flavor = JSON.parse(readFileSync(new URL(`../../apps/flavors/${flavorId}/flavor.json`, import.meta.url), 'utf-8'))

/**
 * 构建目标矩阵（源码依据 ZCode docs/desktop/oss-cdn-multi-target-migration.md 的
 * update/<platform>/<arch> 契约）：win/mac/linux × x64/arm64 共 6 端，
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
await ensureDriverAssets()

// rpm 需 rpmbuild，逐端构建时由 TARGET_RPM=1 显式启用；默认 deb + AppImage 保证任意
// 干净的 Linux 环境都能完成打包，国产化 rpm 产物在装有 rpmbuild 的机器上产出
const linuxTargets = process.env.TARGET_RPM === '1' ? ['deb', 'AppImage', 'rpm'] : ['deb', 'AppImage']

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
  // 拆包钩子：app.asar 重写为 KB 级 ESM 引导器，完整产物改名 app.core.asar；
  // koffi 原生依赖与 resources 版本标记随整包落 resources/（热更包禁止携带 .node）
  afterPack: './scripts/after-pack.cjs',

  extraResources: [
    // 产品形态清单：组合根打包态读取 resources/flavor.json
    { from: `../../apps/flavors/${flavorId}/flavor.json`, to: 'flavor.json' },
    // 应用 dist（packaged 形态）：各应用产物放 resources/apps/<appId>/
    { from: '../../resources/apps', to: 'apps' },
    // 驱动资产：构建期聚合产物注入 resources/devices/，声明 devices/<域>/... 直接命中。
    // system 部署（mac/linux）不携带 DLL，manual 部署（信创）从现场数据目录取，见 docs/driver-packaging.md。
    { from: '../../resources/devices', to: 'devices' },
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

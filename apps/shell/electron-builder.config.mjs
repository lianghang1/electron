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

// 构建期把源码树 assets 按同一套规则聚合成 resources/devices/<域>/<厂商>/<平台>/<文件>，
// 使 bundled 策略的 <resources>/devices/... 与域内声明一一对应（不在 asar 内散落携带 DLL）。
await ensureDriverAssets()

export default {
  appId: `cn.shellplatform.${flavor.id}`,
  productName: flavor.name,
  // 不显式指定会落到 package.json 的 name(@app/shell)，产物变成 "@appshell"
  executableName: flavor.id,
  artifactName: `${flavor.id}-\${version}-\${arch}.\${ext}`,
  directories: {
    output: `release/${flavor.id}`,
    buildResources: 'build',
  },

  files: ['out/**'],

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
    target: [{ target: 'nsis', arch: ['x64'] }],
    // 国产化平台按需追加：electron 不支持的架构走 remote 形态（PlatformCapability 已声明）
  },

  nsis: {
    oneClick: false,
    // 静默参数（/S）由 Win32Installer 默认命令拉起，供整包更新退出后安装
    allowToChangeInstallationDirectory: false,
    perMachine: true,
    deleteAppDataOnUninstall: false,
  },

  mac: {
    target: 'dmg',
    category: 'public.app-category.business',
  },

  linux: {
    target: ['deb', 'AppImage'],
    category: 'Utility',
  },
}

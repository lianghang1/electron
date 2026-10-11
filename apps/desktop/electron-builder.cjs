/**
 * 打包配置：与 electron/main/index.ts 的 bootstrap({ app }) 共同引用 electron/identity.cjs，
 * 应用身份（appId / productName）以 identity.cjs 为唯一真源，此处不重复维护。
 *
 * 文件名用 .cjs 而非 .js：cmd 解析 postinstall 里的 electron-builder 命令时会先搜当前目录
 * 且 PATHEXT 含 .js，同名 electron-builder.js 会被当作命令打开导致安装卡死；.cjs 同样被
 * electron-builder 自动探测，但不属于 PATHEXT，无此风险。
 */
const { appId, productName } = require('./electron/identity.cjs')

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId,
  // productName 决定安装目录与主 exe 名（ASCII 约束见 identity.cjs 注释）
  productName,
  // Linux 可执行文件名：package.json name 是 @app/desktop，sanitize 后的 @appdesktop 不合法，需显式指定
  executableName: productName,
  directories: {
    buildResources: 'build',
  },
  // asar 热更引导器结构：app.asar → app.core.asar（真实代码），app.asar 重写为 KB 级引导器
  // 钩子与引导器为全 app 共享（packages/core），接入方式与打包架构契约见钩子头注释
  afterPack: 'scripts/after-pack.cjs',
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!scripts/*',
    '!electron/**',
    '!shared/**',
    // bundle 自包含（共享 vite 工厂不外部化依赖），node_modules 整体不进 asar：
    // 热更包体积的前提，也规避依赖收集器在 pnpm 下的不确定行为（曾把 devDep 收进 asar）
    '!node_modules/**',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!electron-builder.cjs',
    '!{.eslintcache,eslint.config.mjs,tsconfig.json,tsconfig.node.json,tsconfig.web.json,contracts.d.ts}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    // electron-builder 只自动排除"当前"输出目录；输出目录一旦改名/迁移，旧产物会被打进 asar，显式排除兜底
    '!dist/**',
    '!dist-*/**',
    // 根 resources 走 extraResources（asar 外真实文件），不进 asar；icon 已由 ?asset 构建进 out/
    '!resources/**',
  ],
  // 运行时资源（SumatraPDF / 厂商 DLL / 内置应用页面，需真实文件路径）：
  // dev 取 <应用根>/resources，打包注入 <resourcesPath>/resources，路径解析统一走 core resolveResourcePath
  extraResources: [
    {
      from: 'resources',
      to: 'resources',
    },
  ],
  // 整包更新（electron-updater）：publish 使产物生成 resources/app-update.yml；
  // 运行时 feedURL 由 DESKTOP_UPDATE_FEED 注入覆盖（见 electron/main 的 updates 配置），此处为占位地址
  publish: {
    provider: 'generic',
    url: 'https://updates.example.com/desktop',
  },
  win: {
    // Windows 交付均为 x64；如需 Windows on ARM 在 arch 里追加 arm64
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'build/icon.ico',
  },
  nsis: {
    // 安装包文件名：${version}/${arch}/${ext} 是 electron-builder 模板变量（运行时注入，勿改成 JS 插值）
    artifactName: `${productName}-\${version}-\${arch}.\${ext}`,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    unicode: true,
    // 安装器界面语言 ID：'2052' = 简体中文
    language: '2052',
    // 安装向导品牌位图（resources/brand/generate.ts 生成，oneClick:false 分步向导专属）
    installerHeader: '../../resources/brand/installerHeader.bmp',
    installerSidebar: '../../resources/brand/installerSidebar.bmp',
    uninstallerSidebar: '../../resources/brand/uninstallerSidebar.bmp',
  },
  mac: {
    target: 'dmg',
    notarize: false,
    // icon.icns 在 mac 交付前生成放入 build/（缺失时构建回退默认图标，仅告警）
    icon: 'build/icon.icns',
  },
  linux: {
    target: 'AppImage',
    category: 'Utility',
    icon: 'build/icon.png',
  },
  npmRebuild: false,
  electronDownload: {
    mirror: 'https://npmmirror.com/mirrors/electron/',
  },
}

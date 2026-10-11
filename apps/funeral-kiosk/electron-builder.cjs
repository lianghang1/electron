/**
 * 打包配置：与 electron/main/index.ts 的 bootstrap({ app }) 共同引用 electron/identity.cjs，
 * 应用身份（appId / productName / 中文显示名）以 identity.cjs 为唯一真源，此处不重复维护。
 *
 * 文件名用 .cjs 而非 .js：cmd 解析 postinstall 里的 electron-builder 命令时会先搜当前目录
 * 且 PATHEXT 含 .js，同名 electron-builder.js 会被当作命令打开导致安装卡死；.cjs 同样被
 * electron-builder 自动探测，但不属于 PATHEXT，无此风险。
 */
const { appId, displayName, productName } = require('./electron/identity.cjs')

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId,
  // productName 决定安装目录与主 exe 名（ASCII 约束见 identity.cjs 注释）
  productName,
  // Linux 可执行文件名：package.json name 是 @app/funeral-kiosk，sanitize 后的 @appfuneralkiosk 不合法，需显式指定
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
    // 热更包体积的前提（曾误收 @embedpdf 全字体包/devDep 达 283MB），也规避依赖收集器在 pnpm 下的不确定行为
    '!node_modules/**',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!electron-builder.cjs',
    '!{.eslintcache,eslint.config.mjs,tsconfig.json,tsconfig.node.json,tsconfig.web.json}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    // electron-builder 只自动排除"当前"输出目录；输出目录一旦改名/迁移，旧产物会被打进 asar，显式排除兜底
    '!dist/**',
    '!dist-*/**',
    // resources 走 extraResources（asar 外真实文件），不进 asar；icon 已由 ?asset 构建进 out/
    '!resources/**',
  ],
  // 运行时资源（设备测试页 / 打印组件 / 厂商 DLL，需真实文件路径）：
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
    url: 'https://updates.example.com/funeral-kiosk',
  },
  win: {
    // Windows 自助一体机交付均为 x64；如需 Windows on ARM 在 arch 里追加 arm64
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'build/icon.ico',
  },
  mac: {
    // 注意：dmg 只能在 macOS 上构建（Windows/Linux 无法交叉打 mac 包），
    // 对外分发还需 Apple Developer 证书签名公证（identity: null 时本地自签仅限自测）；
    // icon.icns 在 mac 交付前生成放入 build/（缺失时构建回退默认图标，仅告警）
    target: 'dmg',
    category: 'public.app-category.utilities',
    icon: 'build/icon.icns',
  },
  linux: {
    // 国产化（信创）说明：
    // - UOS 统信 / 麒麟均为 Debian 系 → deb 直接适用
    // - arch 覆盖：x64 = 海光/兆芯，arm64 = 飞腾/鲲鹏（Electron 官方均有二进制）
    // - 龙芯 LoongArch 需龙芯社区移植版 Electron，electron-builder 不原生支持，未配置
    // - AppImage 在 Windows 上交叉构建需要 symlink 特权（EPERM），且 UOS/麒麟走 deb，不配置
    // - 真正的适配门槛在硬件外设（读卡器/打印机厂商 SDK 均为 Windows DLL），打包配置仅解决安装介质
    target: [
      {
        target: 'deb',
        arch: ['x64', 'arm64'],
      },
    ],
    category: 'Utility',
    icon: 'build/icon.png',
  },
  nsis: {
    // 安装包文件名：${version}/${ext} 是 electron-builder 模板变量（运行时注入，勿改成 JS 插值）。
    // 英文文件名便于部署脚本/网盘分发
    artifactName: `${productName}-Setup-\${version}.\${ext}`,
    shortcutName: displayName,
    uninstallDisplayName: displayName,
    // true = 一键安装（无向导，双击直接装完，无任何确认按钮）；false = 分步向导
    oneClick: true,
    // false = 仅当前用户：装进 %LocalAppData%，安装与更新全程零 UAC（无人值守更新链路的前提）
    perMachine: false,
    // 完成页显示「运行 应用」复选框，装完可直接勾选启动
    runAfterFinish: true,
    // 桌面快捷方式：always = 每次安装/升级都确保存在；true = 仅首次安装创建；false = 不创建
    createDesktopShortcut: 'always',
    // 安装器以 Unicode 模式构建。false 时 NSIS 无法正确显示中文界面，必须为 true
    unicode: true,
    // 安装器界面语言 ID：'2052' = 简体中文
    language: '2052',
    // 安装器可选语言列表（多语言时首启动页会弹语言选择；只配 zh_CN 则全程中文无选择步骤）
    installerLanguages: 'zh_CN',
    // 一键安装页顶部横幅 150×57（resources/brand/generate.ts 生成；一键安装无向导侧边栏）
    installerHeader: '../../resources/brand/installerHeader.bmp',
    // 安装/卸载程序 exe 自身显示的图标（资源管理器里 FuneralKiosk-Setup.exe 的图标）
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
  },
  npmRebuild: false,
  electronDownload: {
    mirror: 'https://npmmirror.com/mirrors/electron/',
  },
}

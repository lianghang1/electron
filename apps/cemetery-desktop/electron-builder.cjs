const { createElectronBuilderConfig } = require('@desktop/config/electron-builder')
/**
 * 打包配置：与 electron/main/index.ts 的 bootstrap({ app }) 共同引用 electron/identity.cjs，
 * 应用身份（appId / productName / 中文显示名）以 identity.cjs 为唯一真源，此处不重复维护。
 *
 * 公共契约（files 白名单/publish/asar 架构约束）在 @desktop/config/electron-builder 工厂，
 * 本文件只声明自助一体机形态的平台差异。
 *
 * 文件名用 .cjs 而非 .js：cmd 解析 postinstall 里的 electron-builder 命令时会先搜当前目录
 * 且 PATHEXT 含 .js，同名 electron-builder.js 会被当作命令打开导致安装卡死；.cjs 同样被
 * electron-builder 自动探测，但不属于 PATHEXT，无此风险。
 */
const { appId, displayName, productName } = require('./electron/identity.cjs')

/** @type {import('electron-builder').Configuration} */
module.exports = createElectronBuilderConfig({
  appId,
  productName,
  displayName,
  // 更新 feed 基地址：运行时可被 DESKTOP_UPDATE_FEED 覆盖（见 electron/main 的 updates 配置）
  publishUrl: 'https://updates.example.com/cemetery-desktop',
  overrides: {
    nsis: {
      // 安装包文件名：${version}/${ext} 是 electron-builder 模板变量（运行时注入，勿改成 JS 插值）。
      // 英文文件名便于部署脚本/网盘分发
      artifactName: `${productName}-Setup-\${version}.\${ext}`,
      // 面向用户的中文显示名：桌面快捷方式名称与「应用和功能」卸载列表里显示的名称
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
      // 安装/卸载程序 exe 自身显示的图标（资源管理器里安装包 exe 的图标）
      installerIcon: 'build/icon.ico',
      uninstallerIcon: 'build/icon.ico',
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
  },
})

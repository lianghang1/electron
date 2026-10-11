const { createElectronBuilderConfig } = require('@desktop/config/electron-builder')
/**
 * 打包配置：与 electron/main/index.ts 的 bootstrap({ app }) 共同引用 electron/identity.cjs，
 * 应用身份（appId / productName）以 identity.cjs 为唯一真源，此处不重复维护。
 *
 * 公共契约（files 白名单/publish/asar 架构约束）在 @desktop/config/electron-builder 工厂，
 * 本文件只声明 desktop 形态的平台差异。
 *
 * 文件名用 .cjs 而非 .js：cmd 解析 postinstall 里的 electron-builder 命令时会先搜当前目录
 * 且 PATHEXT 含 .js，同名 electron-builder.js 会被当作命令打开导致安装卡死；.cjs 同样被
 * electron-builder 自动探测，但不属于 PATHEXT，无此风险。
 */
const { appId, productName } = require('./electron/identity.cjs')

/** @type {import('electron-builder').Configuration} */
module.exports = createElectronBuilderConfig({
  appId,
  productName,
  // Linux 可执行文件名：package.json name 是 @app/desktop，sanitize 后的 @appdesktop 不合法
  executableName: productName,
  // 更新 feed 基地址：运行时可被 DESKTOP_UPDATE_FEED 覆盖（见 electron/main 的 updates 配置）
  publishUrl: 'https://updates.example.com/desktop',
  overrides: {
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
  },
})

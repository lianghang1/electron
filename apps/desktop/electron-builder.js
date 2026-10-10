/**
 * 打包配置：与 electron/main/index.ts 的 bootstrap({ app }) 共同引用 electron/identity.mjs，
 * 应用身份（appId / productName）以 identity.mjs 为唯一真源，此处不重复维护。
 *
 * 文件名必须保持 electron-builder.js：electron-builder 26 只自动探测
 * electron-builder.{yml,yaml,json,json5,toml,js,cjs,ts}，.mjs 与 .config.* 命名不会被加载。
 */
import { appId, productName } from './electron/identity.mjs'

/** @type {import('electron-builder').Configuration} */
export default {
  appId,
  // productName 决定安装目录与主 exe 名（ASCII 约束见 identity.mjs 注释）
  productName,
  directories: {
    buildResources: 'build',
  },
  // asar 热更引导器结构：app.asar → app.core.asar（真实代码），app.asar 重写为 KB 级引导器
  // 钩子与引导器为全 app 共享（packages/core），接入方式见钩子头注释
  afterPack: 'scripts/after-pack.cjs',
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!{.eslintcache,eslint.config.mjs,tsconfig.json,tsconfig.node.json,tsconfig.web.json,contracts.d.ts}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
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
  win: {
    target: 'nsis',
  },
  nsis: {
    // 安装包文件名：${version}/${arch}/${ext} 是 electron-builder 模板变量（运行时注入，勿改成 JS 插值）
    artifactName: `${productName}-\${version}-\${arch}.\${ext}`,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    unicode: true,
    // 安装器界面语言 ID：'2052' = 简体中文
    language: '2052',
  },
  mac: {
    target: 'dmg',
    notarize: false,
  },
  linux: {
    target: 'AppImage',
    category: 'Utility',
  },
  npmRebuild: false,
  electronDownload: {
    mirror: 'https://npmmirror.com/mirrors/electron/',
  },
}

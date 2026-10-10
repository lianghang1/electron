import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * 新 App 脚手架：生成与 kiosk 同构的单应用全屏形态骨架（三件套：入口 / 配置 / 脚本）。
 *   pnpm gen:app <slug> <中文名>
 *   例如：pnpm gen:app census 人口普查自助终端
 * 生成的是 Kiosk 形态（全屏 + 韧性 + 无 Tab）；Desktop Shell 形态（Tab 多应用）
 * 请复制 apps/desktop 改造。完成后执行 pnpm install 建立 workspace 链接。
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APPS_DIR = join(ROOT, 'apps')

const [slug, displayName] = process.argv.slice(2)
if (!slug || !displayName) {
  console.error('usage: pnpm gen:app <slug> <中文名>')
  console.error('example: pnpm gen:app census 人口普查自助终端')
  process.exit(1)
}
if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error(`invalid slug "${slug}": 需 kebab-case（小写字母开头，仅含小写字母 / 数字 / 连字符）`)
  process.exit(1)
}

const appDir = join(APPS_DIR, slug)
if (existsSync(appDir)) {
  console.error(`apps/${slug} 已存在`)
  process.exit(1)
}

/** productName / executableName 必须 ASCII（electron-builder 对非 ASCII productName 强制回退 sanitize 名） */
const productName = slug.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
const appId = `com.company.${slug}`

const files: Array<[string, string]> = [
  ['package.json', `${JSON.stringify({
    name: `@app/${slug}`,
    type: 'module',
    version: '1.0.0',
    private: true,
    main: './out/main/index.js',
    scripts: {
      'dev': 'electron-vite dev',
      'start': 'electron-vite preview',
      'typecheck:node': 'tsc --noEmit -p tsconfig.node.json --composite false',
      'typecheck:web': 'vue-tsc --noEmit -p tsconfig.web.json --composite false',
      'typecheck': 'pnpm run typecheck:node && pnpm run typecheck:web',
      'build': 'pnpm run typecheck && electron-vite build',
      'build:win': 'pnpm run build && electron-builder --win',
      'build:mac': 'pnpm run build && electron-builder --mac',
      'build:linux': 'pnpm run build && electron-builder --linux',
      'postinstall': 'electron-builder install-app-deps',
    },
    // 应用身份唯一真源在 electron/identity.mjs（类型声明见 identity.d.mts，打包配置 electron-builder.js
    // 与运行时 bootstrap 共同引用；package.json 的 build 节点会整体覆盖配置文件，禁止使用）
    dependencies: {
      '@desktop/utils': 'workspace:*',
      '@electron-toolkit/utils': 'catalog:',
      '@fun-design/http-alova-axios': 'catalog:',
      '@vueuse/core': 'catalog:',
    },
    devDependencies: {
      '@desktop/config': 'workspace:*',
      '@desktop/core': 'workspace:*',
      '@desktop/shared': 'workspace:*',
      '@types/node': 'catalog:',
      '@vitejs/plugin-vue': 'catalog:',
      'electron': 'catalog:',
      'electron-builder': 'catalog:',
      'electron-vite': 'catalog:',
      'typescript': 'catalog:',
      'vite': 'catalog:',
      'vue': 'catalog:',
      'vue-tsc': 'catalog:',
    },
  }, null, 2)}\n`],

  ['electron.vite.config.ts', `// 工厂经 tsc 预构建为 JS（@desktop/config 的 dist），Node 可直接执行 bare import
import { createElectronViteConfig } from '@desktop/config/vite'
import vue from '@vitejs/plugin-vue'

export default createElectronViteConfig({
  renderer: {
    plugins: [vue()],
  },
})
`],

  ['tsconfig.node.json', `${JSON.stringify({
    extends: '@desktop/config/tsconfig.base.json',
    compilerOptions: {
      composite: true,
      types: ['electron-vite/node'],
    },
    include: ['electron.vite.config.*', 'electron/**/*'],
  }, null, 2)}\n`],

  ['tsconfig.web.json', `${JSON.stringify({
    extends: '@desktop/config/tsconfig.base.json',
    compilerOptions: {
      composite: true,
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    },
    include: ['src/env.d.ts', 'src/**/*', 'src/**/*.vue'],
  }, null, 2)}\n`],

  ['index.html', `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>${productName}</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`],

  ['src/main.ts', `import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
`],

  ['src/env.d.ts', `/// <reference types="vite/client" />
import type { DesktopApi } from '@desktop/shared'

declare global {
  interface Window {
    desktop: DesktopApi
  }
}
`],

  ['src/App.vue', `<script setup lang="ts">
import { onMounted, ref } from 'vue'

const loadedAt = new Date().toLocaleString()
const current = ref('查询中…')

onMounted(async () => {
  try {
    const context = await window.desktop.app.getCurrent()
    current.value = context.appId
  }
  catch {
    current.value = 'IPC 桥接失败'
  }
})
</script>

<template>
  <main class="screen">
    <h1>${displayName}</h1>
    <ul>
      <li>应用：{{ current }}</li>
      <li>加载时间：{{ loadedAt }}</li>
    </ul>
  </main>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #10131a;
  color: #e8ecf4;
  font-family: system-ui, sans-serif;
  user-select: none;
}

h1 {
  margin: 0 0 40px;
  font-size: 48px;
  letter-spacing: 6px;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 14px;
  color: #9aa5b8;
  text-align: left;
}

li + li {
  margin-top: 8px;
}
</style>
`],

  ['electron/main/index.ts', `import { bootstrap } from '@desktop/core'
import icon from '../resources/icon.png?asset'
import { appId, displayName, productName } from '../identity.mjs'

/**
 * ${displayName}：单应用全屏形态（Kiosk 同构骨架）。
 * 自有受信业务，session 权限走 'all'（逃生口语义，直接 Chromium 名）；
 * 进程级安全基线（sandbox / contextIsolation / 导航防护）仍由 core 写死生效。
 */
bootstrap({
  // 运行时身份与打包身份同源于 electron/identity.ts（electron-builder.ts 同样引用）
  app: {
    id: appId,
    name: productName,
    version: '1.0.0',
  },
  window: {
    title: displayName,
    width: 1920,
    height: 1080,
  },
  apps: {
    allowThirdParty: false,
  },
  // 更新体系开关：DESKTOP_UPDATE_FEED 指向更新服务器（整包 latest.yml + asar 清单同源），
  // 生产部署写进部署环境；未配置则两种更新都禁用
  updates: process.env.DESKTOP_UPDATE_FEED
    ? { url: process.env.DESKTOP_UPDATE_FEED, asar: 'asar-manifest.json' }
    : undefined,
  // 单应用形态：不装配 Tab 体系（Tab/App/Web 服务不实例化，tabs:* 通道不注册）
  features: {
    tabs: false,
  },
  // 无人值守韧性：崩溃自恢复 + 开机自启 + 防退出 + 每日 3:00 定时重启（应用更新/释放内存）
  resilience: {
    crashReload: true,
    autoLaunch: true,
    exitGuard: true,
    scheduledRestart: {},
  },
  icon,
  browserWindowOptions: {
    fullscreen: true,
    kiosk: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#10131a', // 与 renderer 底色一致，避免全屏启动闪白
  },
  permissions: 'all',
})
`],

  ['electron/preload/index.ts', `import { exposeDesktop } from '@desktop/core/preload'

// 平台桥：无 App 业务通道；有业务通道时传白名单，如 exposeDesktop(['${slug}:query'])
exposeDesktop()
`],

  ['scripts/after-pack.cjs', `/**
 * electron-builder afterPack 薄壳：electron-builder 校验钩子路径必须在 projectDir 内，
 * 共享实现（packages/core/scripts/after-pack.cjs）经包名 require 接入，全部逻辑见彼处。
 */
module.exports = require('@desktop/core/scripts/after-pack.cjs')
`],

  ['electron/identity.mjs', `/**
 * 应用身份唯一真源：运行时（electron/main 的 bootstrap）与打包（electron-builder.js）共同引用，
 * 改产品名只需要改这里，构建产物各处（exe 名/目录/安装包文件名/快捷方式/卸载列表）均由此派生。
 *
 * 用 .mjs 而非 .ts 的原因：electron-builder 26 的 .ts 配置走 config-file-ts 编译缓存，
 * 编译后需在用户缓存目录创建 node_modules 符号链接，Windows 无符号链接特权（未开开发者模式）时
 * EPERM 直接崩溃；.js 配置走原生 ESM import，零编译零符号链接。
 */

/** 打包身份 ID：appId（对应 bootstrap.app.id，Windows App User Model ID / 单实例锁等运行时身份的基础） */
export const appId = '${appId}'

/**
 * 英文产品名：exe 名 / 安装目录 / 安装包文件名前缀（对应 bootstrap.app.name）。必须 ASCII：
 * electron-builder 对非 ASCII productName 强制回退 sanitized name，@app/${slug} 会变成难看的 @app${slug.replace(/-/g, '')} 目录
 */
export const productName = '${productName}'

/** 面向用户的中文显示名：窗口标题 / 桌面快捷方式名称 / 「应用和功能」卸载列表显示名 */
export const displayName = '${displayName}'
`],

  ['electron/identity.d.mts', `/**
 * 应用身份的类型声明：实现在同目录 identity.mjs，TS 侧（electron/main）引用 identity.mjs 时
 * 由此文件获得显式类型；打包配置（electron-builder.js）为 JS，直接引用 .mjs，无需本文件。
 */

/** 打包身份 ID：appId（对应 bootstrap.app.id，Windows App User Model ID / 单实例锁等运行时身份的基础） */
export declare const appId: string

/** 英文产品名：exe 名 / 安装目录 / 安装包文件名前缀（对应 bootstrap.app.name）。必须 ASCII（原因见 identity.mjs 注释） */
export declare const productName: string

/** 面向用户的中文显示名：窗口标题 / 桌面快捷方式名称 / 「应用和功能」卸载列表显示名 */
export declare const displayName: string
`],

  ['electron-builder.js', `/**
 * 打包配置：与 electron/main/index.ts 的 bootstrap({ app }) 共同引用 electron/identity.mjs，
 * 应用身份（appId / productName / 中文显示名）以 identity.mjs 为唯一真源，此处不重复维护。
 *
 * 文件名必须保持 electron-builder.js：electron-builder 26 只自动探测
 * electron-builder.{yml,yaml,json,json5,toml,js,cjs,ts}，.mjs 与 .config.* 命名不会被加载。
 */
import { appId, displayName, productName } from './electron/identity.mjs'

/** @type {import('electron-builder').Configuration} */
export default {
  appId,
  // productName 决定安装目录与主 exe 名（ASCII 约束见 identity.mjs 注释）
  productName,
  // Linux 可执行文件名：package.json name 是 @app/${slug}，sanitize 后的 @app${slug.replace(/-/g, '')} 不合法，需显式指定
  executableName: productName,
  directories: {
    buildResources: 'build',
  },
  // asar 热更引导器结构：app.asar → app.core.asar（真实代码），app.asar 重写为 KB 级引导器
  // 钩子与引导器为全 app 共享（packages/core），接入方式见钩子头注释
  afterPack: 'scripts/after-pack.cjs',
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!scripts/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!{.eslintcache,eslint.config.mjs,tsconfig.json,tsconfig.node.json,tsconfig.web.json}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
  ],
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
    // 安装包文件名：\${version}/\${ext} 是 electron-builder 模板变量（运行时注入，勿改成 TS 插值）。
    // 英文文件名便于部署脚本/网盘分发
    artifactName: \`\${productName}-Setup-\\\${version}.\\\${ext}\`,
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
    // 安装器界面语言 ID：'2052' = 简体中文（NSISOptions.language 类型为 string，须用字符串）
    language: '2052',
    // 安装器可选语言列表（多语言时首启动页会弹语言选择；只配 zh_CN 则全程中文无选择步骤）
    installerLanguages: 'zh_CN',
    // 安装/卸载程序 exe 自身显示的图标（资源管理器里 ${productName}-Setup.exe 的图标）
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
  },
  npmRebuild: false,
  electronDownload: {
    mirror: 'https://npmmirror.com/mirrors/electron/',
  },
}
`],
]

for (const [relativePath, content] of files) {
  const target = join(appDir, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf-8')
}

// 统一莲花占位图标（正式图标用 resources/brand/generate.ts 流程生成后替换）：
// electron/resources/icon.png 供 bootstrap 窗口图标；build/icon.ico 供 NSIS/exe；build/icon.png 供 linux deb
const kioskDir = join(APPS_DIR, 'funeral-kiosk')
cpSync(join(kioskDir, 'resources/icon.png'), join(appDir, 'electron/resources/icon.png'))
cpSync(join(kioskDir, 'resources/icon.png'), join(appDir, 'build/icon.png'))
cpSync(join(kioskDir, 'build/icon.ico'), join(appDir, 'build/icon.ico'))

console.log(`created apps/${slug}`)
console.log(`  形态       Kiosk（全屏单应用）`)
console.log(`  appId      ${appId}`)
console.log(`  productName ${productName}（ASCII，面向用户的中文见窗口标题）`)
console.log(`next: pnpm install → pnpm --filter @app/${slug} dev`)

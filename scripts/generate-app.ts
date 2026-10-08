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
    build: {
      appId,
      productName,
      // ${} 是 electron-builder 占位符语法（字面量，非 JS 模板）
      // eslint-disable-next-line no-template-curly-in-string
      artifactName: '${productName}-${version}-${arch}.${ext}',
    },
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

/**
 * ${displayName}：单应用全屏形态（Kiosk 同构骨架）。
 * 自有受信业务，session 权限走 'all'（逃生口语义，直接 Chromium 名）；
 * 进程级安全基线（sandbox / contextIsolation / 导航防护）仍由 core 写死生效。
 */
bootstrap({
  app: {
    id: '${appId}',
    name: '${productName}',
    version: '1.0.0',
  },
  window: {
    title: '${displayName}',
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

  ['electron-builder.yml', `appId: ${appId}
productName: ${productName}
directories:
  buildResources: build
# asar 热更引导器结构：app.asar → app.core.asar（真实代码），app.asar 重写为 KB 级引导器
# 本文件是薄壳，共享实现在 packages/core/scripts/after-pack.cjs（见彼处头注释）
afterPack: scripts/after-pack.cjs
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintcache,eslint.config.mjs,tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml}'
win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico
nsis:
  artifactName: ${productName}-Setup-\${version}.\${ext}
  # 无人值守终端：一键静默装 + 用户级目录，更新链路（整包重装/热更）全程零 UAC
  oneClick: true
  perMachine: false
  runAfterFinish: true
  createDesktopShortcut: always
  unicode: true
  language: 2052
npmRebuild: false
electronDownload:
  mirror: https://npmmirror.com/mirrors/electron/
`],
]

for (const [relativePath, content] of files) {
  const target = join(appDir, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf-8')
}

// 统一莲花占位图标（正式图标用 resources/brand/generate.ts 流程生成后替换）：
// electron/resources/icon.png 供 bootstrap 窗口图标；build/icon.ico 供 NSIS/exe
cpSync(join(APPS_DIR, 'kiosk/electron/resources/icon.png'), join(appDir, 'electron/resources/icon.png'))
cpSync(join(APPS_DIR, 'kiosk/build/icon.ico'), join(appDir, 'build/icon.ico'))

console.log(`created apps/${slug}`)
console.log(`  形态       Kiosk（全屏单应用）`)
console.log(`  appId      ${appId}`)
console.log(`  productName ${productName}（ASCII，面向用户的中文见窗口标题）`)
console.log(`next: pnpm install → pnpm --filter @app/${slug} dev`)

/**
 * Electron 二进制自愈：postinstall 时保证 node_modules/electron/dist 就位。
 *
 * 背景：electron 的二进制由其自身 postinstall 下载，但该步可能被 pnpm 脚本
 * 白名单/缓存命中/网络中断静默跳过，症状滞后到 dev 启动才暴露
 * （electron-vite 报 "Electron uninstall"）。本脚本把问题前移到 install 阶段：
 *   - 二进制已就位 → 直接通过（幂等，秒级）
 *   - 缺失 → 注入 npmmirror 镜像重跑 install.js，最多重试 2 次
 *   - 仍失败 → 给出可直接复制的修复命令，安装不再静默带病通过
 */
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const MIRROR = 'https://npmmirror.com/mirrors/electron/'
const require = createRequire(import.meta.url)

/** electron 包真实目录（兼容 pnpm symlink 结构） */
function electronDir() {
  return path.dirname(require.resolve('electron/package.json'))
}

function binaryReady(dir) {
  const pathTxt = path.join(dir, 'path.txt')
  if (!existsSync(pathTxt))
    return false
  const binaryName = readFileSync(pathTxt, 'utf8').trim()
  return existsSync(path.join(dir, 'dist', binaryName))
}

function runInstall(dir) {
  const result = spawnSync(process.execPath, ['install.js'], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_MIRROR: MIRROR, electron_mirror: MIRROR },
    timeout: 10 * 60 * 1000,
  })
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(detail || `install.js 退出码 ${result.status}`)
  }
}

const dir = electronDir()
if (binaryReady(dir)) {
  console.log('[ensure-electron] 二进制已就位，跳过下载')
  process.exit(0)
}

console.log(`[ensure-electron] Electron 二进制缺失，走镜像补下载：${MIRROR}`)
let lastError
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    runInstall(dir)
    if (binaryReady(dir)) {
      console.log('[ensure-electron] 下载完成，二进制就位')
      process.exit(0)
    }
    lastError = new Error('install.js 执行成功但 dist 仍缺失')
  }
  catch (error) {
    lastError = error
    console.warn(`[ensure-electron] 第 ${attempt} 次尝试失败：${error.message.slice(0, 300)}`)
  }
}

console.error(`
[ensure-electron] 自动补下载失败：${lastError?.message?.slice(0, 500)}

手动修复（任选其一）：
  1. node node_modules/electron/install.js
  2. pnpm rebuild electron
若持续网络超时，先设置镜像再执行：
  PowerShell: $env:ELECTRON_MIRROR="${MIRROR}"; node node_modules/electron/install.js
  CMD:        set ELECTRON_MIRROR=${MIRROR} && node node_modules/electron/install.js
`)
process.exit(1)

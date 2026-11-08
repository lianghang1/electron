import { spawnSync } from 'node:child_process'
/**
 * Electron 二进制自愈：postinstall 时保证 node_modules/electron/dist 就位。
 *
 * 背景：electron 的二进制由其自身 postinstall 下载，但该步可能被 pnpm 脚本
 * 白名单/缓存命中/网络中断静默跳过，症状滞后到 dev 启动才暴露
 * （electron-vite 报 "Electron uninstall"）。本脚本把问题前移到 install 阶段：
 *   - 二进制已就位 → 直接通过（幂等，秒级）
 *   - 缺失 → 按官方源重跑 install.js，最多重试 2 次
 *   - 仍失败 → 给出可直接复制的修复命令，安装不再静默带病通过
 *
 * 下载源默认官方 release，不擅自改写用户环境。仅当显式设置
 * SHELL_ELECTRON_MIRROR=1 时注入 npmmirror 镜像；用户自行设置的
 * ELECTRON_MIRROR / electron_mirror 优先级更高，脚本不覆盖。
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const MIRROR = 'https://npmmirror.com/mirrors/electron/'
const require = createRequire(import.meta.url)

/** electron 包真实目录（兼容 pnpm symlink 结构） */
function electronDir() {
  return path.dirname(require.resolve('electron/package.json'))
}

function binaryReady(dir) {
  const pathTxt = path.join(dir, 'path.txt')
  if (!existsSync(pathTxt)) { return false }
  const binaryName = readFileSync(pathTxt, 'utf8').trim()
  return existsSync(path.join(dir, 'dist', binaryName))
}

function installEnv() {
  const env = { ...process.env }
  if (process.env.SHELL_ELECTRON_MIRROR === '1'
    && !env.ELECTRON_MIRROR && !env.electron_mirror) {
    env.ELECTRON_MIRROR = MIRROR
    env.electron_mirror = MIRROR
  }
  return env
}

function runInstall(dir) {
  const result = spawnSync(process.execPath, ['install.js'], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: installEnv(),
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

const useMirror = process.env.SHELL_ELECTRON_MIRROR === '1'
  || Boolean(process.env.ELECTRON_MIRROR || process.env.electron_mirror)
console.log(`[ensure-electron] Electron 二进制缺失，补下载（${useMirror ? '镜像源' : '官方源'}）`)
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
官方源网络不通时，显式启用镜像后重试：
  PowerShell: $env:SHELL_ELECTRON_MIRROR="1"; pnpm rebuild electron
  CMD:        set SHELL_ELECTRON_MIRROR=1 && pnpm rebuild electron
`)
process.exit(1)

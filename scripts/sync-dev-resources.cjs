/**
 * 设备资源同步：为每个 app 的 resources/devices 建立 junction，指向仓库级单一来源
 * resources/devices（厂商 DLL / license / SumatraPDF 等，与硬件驱动的消费方 packages/core 同仓）。
 *
 * 为什么是 junction 而不是复制：
 * - 单一来源，更新厂商文件后所有 app 自动生效，不存在"逐 app 复制漏一份"的漂移
 * - dev 态 resolveResourcePath 以 <app>/resources 为根，junction 对 fs/LoadLibrary 完全透明
 * - 打包态 electron-builder 从 <app>/resources 复制时解引用 junction，产物无需任何额外配置
 * - Windows junction 无需管理员特权；非 Windows 平台退化为符号链接
 *
 * 由根 package.json 的 postinstall 自动执行（幂等：已指向正确目标的链接跳过），
 * 也可手动运行：pnpm sync:resources
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SHARED_DEVICES = path.join(ROOT, 'resources', 'devices')
const APPS_DIR = path.join(ROOT, 'apps')

function listApps() {
  return fs.readdirSync(APPS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter(entry => fs.existsSync(path.join(APPS_DIR, entry.name, 'package.json')))
    .map(entry => entry.name)
}

/** junction 目标必须是绝对路径（Windows junction 不支持相对目标） */
function junctionTargetOk(linkPath, target) {
  try {
    return fs.readlinkSync(linkPath) === target
  } catch {
    return false
  }
}

function syncApp(app) {
  const linkPath = path.join(APPS_DIR, app, 'resources', 'devices')
  fs.mkdirSync(path.dirname(linkPath), { recursive: true })

  const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false })
  if (existing?.isSymbolicLink()) {
    if (junctionTargetOk(linkPath, SHARED_DEVICES)) {
      console.log(`  = ${app}: resources/devices 已同步`)
      return
    }
    fs.rmSync(linkPath)
  } else if (existing) {
    // 普通目录（历史遗留的复制副本）：内容已迁移到共享源，直接移除后重建链接
    fs.rmSync(linkPath, { recursive: true, force: true })
  }

  fs.symlinkSync(SHARED_DEVICES, linkPath, 'junction')
  console.log(`  + ${app}: resources/devices -> resources/devices（仓库级单一来源）`)
}

if (!fs.existsSync(SHARED_DEVICES)) {
  console.error(`[sync-dev-resources] 共享设备资源不存在: ${SHARED_DEVICES}`)
  process.exit(1)
}

console.log('[sync-dev-resources]')
for (const app of listApps()) {
  syncApp(app)
}

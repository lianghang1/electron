/**
 * dev 设备链路自诊断（跨平台）：`pnpm doctor` 或 `node scripts/doctor-dev.mjs`
 *
 * 逐项核查设备域在 dev 态依赖的全部事实，任何一项失败都给出可执行的修复指引。
 * 定位「设备全灭 / ws 服务不通」类问题：先跑本脚本，再按输出处理。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHELL_DIR = join(REPO_ROOT, 'apps', 'shell')

function dirname(p) {
  return statSync(p).isFile() ? resolve(p, '..') : p
}

const results = []
function report(name, ok, detail, fix) {
  results.push({ name, ok, detail, fix })
  const mark = ok ? 'OK ' : 'FAIL'
  console.log(`[${mark}] ${name}`)
  console.log(`       ${detail}`)
  if (!ok && fix) {
    console.log(`       → ${fix}`)
  }
}

/** TCP 探活（ws 服务端前置事实：端口通了 ws 才可能通） */
function tcpProbe(host, port, timeoutMs = 3000) {
  return new Promise((resolveProbe) => {
    const socket = new net.Socket()
    const done = (ok) => {
      socket.destroy()
      resolveProbe(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('error', () => done(false))
    socket.once('timeout', () => done(false))
    socket.connect(port, host, () => done(true))
  })
}

// ── 1. 驱动资产（DLL/SumatraPDF）：dev 前置脚本重建，缺失 = 全部 DLL 域瘫痪 ──
const assetsRoot = join(REPO_ROOT, 'resources', 'devices')
if (existsSync(assetsRoot)) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) { walk(p) }
      else { files.push(p) }
    }
  }
  walk(assetsRoot)
  report('驱动资产 resources/devices/', true, `${files.length} 个文件（capture/idcard/iccard/print/signature 五域）`)
}
else {
  report('驱动资产 resources/devices/', false, '目录不存在——所有 DLL 域（身份证读卡器 / IC 卡 / 签名屏 / 打印 SumatraPDF）将不可用', '在仓库根执行: node scripts/prepare-driver-assets.mjs （或直接用 pnpm dev，它已内置前置）')
}

// ── 2. koffi 原生模块：device-host 守护进程经 createRequire 裸名解析 ──
const hostOutDir = join(SHELL_DIR, 'out', 'main')
try {
  const req = createRequire(join(hostOutDir, 'probe.js'))
  const koffiPath = req.resolve('koffi')
  report('koffi 原生模块解析', true, koffiPath)
}
catch (err) {
  report('koffi 原生模块解析', false, String(err), '在仓库根执行: pnpm install （根 package.json 已声明 koffi）')
}

// ── 3. device-host 入口产物：electron-vite dev 的 main 构建 input ──
const hostEntry = join(hostOutDir, 'device-host.js')
report('device-host 入口 out/main/device-host.js', existsSync(hostEntry), existsSync(hostEntry) ? '存在（dev 运行时由 electron-vite 生成）' : '不存在', existsSync(hostEntry) ? '' : '跑一次 pnpm dev 即生成')

// ── 4. 平台能力表：dev 与打包共用同一能力事实源 ──
const isWin = process.platform === 'win32'
report('宿主平台', true, `${process.platform}/${process.arch}${isWin ? '（全域能力开放）' : '（非 Windows：DLL 域按平台能力表关闭属正常）'}`)

// ── 5. 厂商 ws 服务端口（出厂档案声明的服务端）──
/** Windows 侧枚举本机服务（含未运行的），给「服务到底装没装」一个确定答案 */
function listWindowsServices() {
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      'Get-Service | ForEach-Object { "{0}|{1}|{2}" -f $_.Name, $_.DisplayName, $_.Status }',
    ], { timeout: 15000, encoding: 'utf-8' })
    return out.split(/\r?\n/).filter(Boolean).map((line) => {
      const [name, display, status] = line.split('|')
      return { name, display: display ?? '', status: status ?? '' }
    })
  }
  catch {
    return []
  }
}

const wsTargets = [
  { name: 'CamSDK 高拍仪中间件（CamSDKServer）', host: '127.0.0.1', port: 9000, brandPattern: /cam|scan|华夏|高拍/i },
  { name: '点易拍本地服务', host: 'localhost', port: 9002, brandPattern: /点易拍|dianyi|elp/i },
]
if (isWin) {
  const services = listWindowsServices()
  if (services.length > 0) {
    console.log('\n本机 Windows 服务中与厂商相关的条目：')
    for (const t of wsTargets) {
      const hits = services.filter(s => t.brandPattern.test(s.display) || t.brandPattern.test(s.name))
      if (hits.length === 0) {
        console.log(`  [缺] ${t.name}：未发现相关服务——厂商服务端很可能未安装`)
      }
      else {
        for (const s of hits) {
          console.log(`  [${s.status === 'Running' ? '运行中' : s.status}] ${s.display} (${s.name})`)
        }
      }
    }
  }
}
console.log('')
for (const t of wsTargets) {
  const ok = await tcpProbe(t.host, t.port)
  report(`ws 服务端口 ${t.host}:${t.port}`, ok, ok ? '端口可达（厂商服务端运行中）' : '端口不通——该品牌设备的采集/读卡/签名全部依赖此常驻服务', ok ? '' : `确认厂商服务端已安装并运行：Windows 服务管理器找 ${t.name} 对应服务（名称含品牌），或联系装机人员；服务启动后刷新设备列表会自动重试`)
}

// ── 汇总 ──
const failed = results.filter(r => !r.ok)
console.log('\n──── 诊断汇总 ────')
if (failed.length === 0) {
  console.log('全部通过：dev 设备链路基础事实健康。若调试台仍报错，请提供调试台「运行观测」的错误码。')
}
else {
  console.log(`${failed.length} 项未通过，按上方 → 指引处理后重试。`)
  process.exitCode = 1
}

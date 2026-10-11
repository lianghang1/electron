import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

/**
 * 打包产物自动冒烟（项目树外裸环境，杜绝开发机 node_modules 的目录树侥幸）：
 *   pnpm exec tsx scripts/e2e-packaged.ts <app> [--hot] [--dir <win-unpacked>] [--keep] [--cdp-port 9333]
 *
 * 基线断言（--hot 可选）：
 *   1. 产物文件齐备（双 asar / app-update.yml / koffi 平台二进制 / asar 内含 CJS 入口）
 *   2. 树外启动 → 引导器加载内置包（launcher.log）
 *   3. 渲染层桥就位（window.desktop 命名空间）+ 设备档案 API 可调
 *   4. --hot：本地供流热更清单 → 客户端下载校验写 pending → update.install() 重启
 *      → 引导器加载热更包（loaded hot core）
 *
 * 退出码 0 = 全部通过；任何一步失败立即报错退出。--keep 保留临时目录与进程供人工排查。
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPS_DIR = path.join(ROOT, 'apps')
const CDP_PORT = Number(process.argv.find((a, i) => process.argv[i - 1] === '--cdp-port') ?? 9333)
const APP = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'desktop'
const HOT = process.argv.includes('--hot')
const KEEP = process.argv.includes('--keep')
const dirOverrideIndex = process.argv.indexOf('--dir')
const DIR_OVERRIDE = dirOverrideIndex >= 0 ? process.argv[dirOverrideIndex + 1] : undefined

const require = createRequire(import.meta.url)
const identity = require(path.join(APPS_DIR, APP, 'electron/identity.cjs')) as { productName: string }

const packedDir = DIR_OVERRIDE ?? path.join(APPS_DIR, APP, 'dist', 'win-unpacked')
const exeName = `${identity.productName}.exe`
const tempDir = path.join(process.env.TEMP ?? '/tmp', `${APP}-e2e-${Date.now()}`)
const userDataDir = path.join(process.env.APPDATA ?? '', identity.productName)
const launcherLog = path.join(userDataDir, 'desktop-updater', 'launcher.log')

function step(name: string, ok: boolean, detail = ''): boolean {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
  return ok
}

function fail(message: string): never {
  console.error(`\n[E2E-FAIL] ${message}`)
  process.exit(1)
}

/** 打包产物文件断言（含 asar 内 CJS 入口标记，防"空包"回归） */
function assertArtifacts(): void {
  const resources = path.join(packedDir, 'resources')
  for (const file of ['app.asar', 'app.core.asar', 'app-update.yml']) {
    if (!existsSync(path.join(resources, file)))
      fail(`缺少产物 ${file}`)
  }
  const triplet = `${process.platform}_${process.arch}`
  const koffiNode = path.join(resources, 'node_modules', 'koffi', 'build', triplet, 'koffi.node')
  if (!existsSync(koffiNode))
    fail(`缺少 koffi 平台二进制 ${koffiNode}`)
  // asar 头部含 out 与 CJS 入口标记（字节级检查，无需 asar 依赖）
  const header = readFileSync(path.join(resources, 'app.core.asar')).subarray(0, 4_000_000).toString('latin1')
  if (!header.includes('"out":{"files"'))
    fail('app.core.asar 内不含 out/ 构建产物（疑似空包：先跑 vite build 再打包）')
  if (!header.includes('"index.cjs"'))
    fail('app.core.asar 内不含 out/main/index.cjs（bundle 必须为 CJS 入口）')
  console.log(`  [PASS] 产物文件齐备（asar=${statSync(path.join(resources, 'app.core.asar')).size}B）`)
}

// ---------- CDP ----------

interface CdpTarget { type: string, url: string, webSocketDebuggerUrl: string }

function cdpTargets(port: number): Promise<CdpTarget[]> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
}

function cdpEvaluate(wsUrl: string, expression: string, timeoutMs = 30_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false })
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error('cdp evaluate timeout'))
    }, timeoutMs)
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }))
      ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as { id: number, result?: { result?: { value?: unknown } } }
      if (msg.id === 2) {
        clearTimeout(timer)
        ws.close()
        resolve(msg.result?.result?.value)
      }
    })
    ws.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function withMainPage(port: number, fn: (wsUrl: string) => Promise<void>): Promise<void> {
  const targets = await cdpTargets(port)
  const main = targets.find(t => t.type === 'page' && !t.url.includes('#/overlay'))
  if (!main)
    fail('CDP 未发现主窗口 page target')
  await fn(main.webSocketDebuggerUrl)
}

/** 轮询文件内容直到匹配（launcher.log / pending.json 等异步产物） */
function pollFile(file: string, matcher: (content: string) => boolean, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      const content = existsSync(file) ? readFileSync(file, 'utf-8') : ''
      if (matcher(content)) {
        clearInterval(timer)
        resolve()
      }
      else if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error(`${label} 超时（${Math.round(timeoutMs / 1000)}s）`))
      }
    }, 500)
  })
}

// ---------- --hot 本地供流服务器（仅 asar 通道） ----------

function startHotfixServer(hotfixDir: string): Promise<{ port: number, close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname.slice(1))
      const file = path.join(hotfixDir, path.basename(name))
      if (!existsSync(file)) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'content-length': statSync(file).size })
      res.end(readFileSync(file))
    })
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      resolve({ port, close: () => server.close() })
    })
  })
}

// ---------- 主流程 ----------

async function main(): Promise<void> {
  console.log(`e2e-packaged: ${APP}（树外冒烟${HOT ? ' + 热更闭环' : ''}）`)
  if (!existsSync(packedDir))
    fail(`打包产物不存在：${packedDir}（先跑 build:win）`)
  assertArtifacts()

  // 1. 树外副本 + 干净热更状态
  rmSync(tempDir, { recursive: true, force: true })
  mkdirSync(tempDir, { recursive: true })
  for (const entry of readdirSync(packedDir))
    cpTree(path.join(packedDir, entry), path.join(tempDir, entry))
  rmSync(path.join(userDataDir, 'desktop-updater'), { recursive: true, force: true })
  console.log('  [PASS] 树外副本就绪（杜绝目录树 node_modules 侥幸）')

  // 2. --hot：本地供流服务器
  let hotServer: { port: number, close: () => void } | undefined
  if (HOT) {
    const hotfixDir = path.join(APPS_DIR, APP, 'dist', 'hotfix')
    const manifestPath = path.join(hotfixDir, 'asar-manifest.json')
    if (!existsSync(manifestPath))
      fail(`缺少热更发布物 ${manifestPath}（先跑 pnpm hotfix ${APP}）`)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version: string, url: string, sha256: string }
    const asarFile = path.join(hotfixDir, path.basename(manifest.url))
    const actual = createHash('sha256').update(readFileSync(asarFile)).digest('hex')
    if (actual !== manifest.sha256.toLowerCase())
      fail('热更包 sha256 与清单不符')
    hotServer = await startHotfixServer(hotfixDir)
    console.log(`  [PASS] 热更供流服务器 :${hotServer.port}（版本 ${manifest.version}）`)
  }

  // 3. 启动打包版
  const exe = path.join(tempDir, exeName)
  const env = {
    ...process.env,
    ...(hotServer ? { DESKTOP_UPDATE_FEED: `http://127.0.0.1:${hotServer.port}/` } : {}),
  }
  spawn(exe, ['--remote-debugging-port=9333'], { env, stdio: 'ignore' })

  try {
    // 4. 内置包加载
    await pollFile(launcherLog, c => c.includes('loaded builtin core'), 90_000, 'launcher 加载内置包')
    console.log('  [PASS] 引导器加载内置包（树外裸环境）')

    // 5. CDP 等主窗口就绪 → 渲染桥 + 设备档案 API
    let cdpReady = false
    for (let i = 0; i < 30 && !cdpReady; i++) {
      await new Promise(r => setTimeout(r, 1000))
      try {
        await withMainPage(CDP_PORT, async (wsUrl) => {
          const keys = await cdpEvaluate(wsUrl, 'Object.keys(window.desktop || {}).join(",")') as string
          if (!keys.includes('device') || !keys.includes('update'))
            throw new Error(`window.desktop 命名空间缺失: ${keys}`)
          const profiles = await cdpEvaluate(wsUrl, 'window.desktop.capture.getProfiles().then(p => p.length).catch(e => Promise.reject(String(e).slice(0, 80)))', 20_000)
          console.log(`  [PASS] 渲染桥与设备档案 API（profiles=${profiles}）`)
        })
        cdpReady = true
      }
      catch { /* 应用未就绪，重试 */ }
    }
    if (!cdpReady)
      fail('CDP 阶段未通过（窗口/渲染桥/设备 API）')

    // 6. --hot：下载校验 → 触发安装 → 重启加载热更包
    if (HOT && hotServer) {
      await pollFile(path.join(userDataDir, 'desktop-updater', 'pending.json'), c => c.includes('"version"'), 90_000, '热更下载与校验')
      console.log('  [PASS] 热更下载 + sha256 校验 + pending 就位')
      // install() 内部 relaunch + exit(0)：进程退出会使 CDP 响应不可达——发即忘，结果以 launcher.log 为准
      await withMainPage(CDP_PORT, async (wsUrl) => {
        await cdpEvaluate(wsUrl, 'window.desktop.update.install().catch(e => String(e).slice(0, 120))', 5_000).catch(() => undefined)
      })
      await pollFile(launcherLog, c => c.includes('loaded hot core'), 60_000, '重启后加载热更包')
      console.log('  [PASS] 指针切换完成，热更包加载生效')
    }
  }
  finally {
    if (!KEEP) {
      spawnSync('taskkill', ['/IM', exeName, '/F'], { stdio: 'ignore' })
      // 等进程完全退出再删目录（Windows 文件锁释放有延迟，热更重启的新实例也在跑）
      for (let i = 0; i < 20; i++) {
        const running = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${exeName}`], { encoding: 'utf-8' })
          .stdout
          ?.includes(exeName)
        if (!running)
          break
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      hotServer?.close()
      try {
        rmSync(tempDir, { recursive: true, force: true })
        rmSync(path.join(userDataDir, 'desktop-updater'), { recursive: true, force: true })
      }
      catch (error) {
        console.warn(`  [WARN] 清理不完整（文件仍被占用，可手动删除）: ${String(error).slice(0, 80)}`)
      }
    }
  }
  console.log('\nE2E PASS')
}

/** 递归拷贝目录树（打包产物为普通文件树，无需符号链接处理） */
function cpTree(from: string, to: string): void {
  if (statSync(from).isDirectory()) {
    mkdirSync(to, { recursive: true })
    for (const entry of readdirSync(from))
      cpTree(path.join(from, entry), path.join(to, entry))
  }
  else {
    copyFileSync(from, to)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

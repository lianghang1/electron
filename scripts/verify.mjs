#!/usr/bin/env node
// 干净 clone 全链路验证：复制「git 会入库的文件」到临时目录，排除一切 gitignore 产物，
// 再跑 install → guard → design → lint → typecheck → build → design:css → dev 解析阶段。
// 退出码说话，结论不依赖任何人的口述；这一步专门防「沙箱里有产物、用户本地没有」。
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WORK = join(ROOT, '.verify-work')

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
}

/**
 * 收尾清理：rmSync 重试（taskkill 返回 ≠ 句柄释放）吸收短窗口；仍有存活进程
 * 抓着目录（esbuild 常驻服务等）时，改名为 trash 目录让出 WORK 路径——
 * 清理是家务事，绝不让全绿的 verify 以退出码 1 告终，残留由下次运行扫除。
 */
function cleanupWork() {
  try {
    rmSync(WORK, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
  catch (err) {
    const trash = `${WORK}-trash-${Date.now()}`
    try {
      renameSync(WORK, trash)
    }
    catch {
      console.warn(`[verify] 清理被占用但无法改名，保留现场：${err.code ?? ''}`)
    }
    try {
      rmSync(trash, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    }
    catch {
      console.warn(`[verify] 残留待清：${basename(trash)}（下次运行扫除）`)
    }
  }
}

function sweepTrash() {
  for (const name of readdirSync(ROOT)) {
    if (name.startsWith('.verify-work-trash-')) {
      rmSync(join(ROOT, name), { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    }
  }
}

// 只复制 git 会入库的文件（含已暂存/未跟踪但非 ignore 的），天然排除 dist/out/resources/devices
function stageCleanTree() {
  sweepTrash()
  cleanupWork()
  mkdirSync(WORK, { recursive: true })
  const list = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0')
    .filter(Boolean)
  let copied = 0
  for (const f of list) {
    const src = join(ROOT, f)
    if (!existsSync(src)) { continue }
    const dest = join(WORK, f)
    mkdirSync(dirname(dest), { recursive: true })
    const buf = readFileSync(src)
    writeFileSync(dest, buf)
    copied++
  }
  return { copied, hasLock: existsSync(join(WORK, 'pnpm-lock.yaml')) }
}

function run(label, cmd, args, opts = {}) {
  const t0 = Date.now()
  const r = spawnSync(cmd, args, {
    cwd: WORK,
    encoding: 'utf8',
    shell: false,
    timeout: opts.timeout ?? 480000,
    env: { ...process.env, ...(opts.env || {}) },
  })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const ok = r.status === 0
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(16)} ${secs}s  (exit ${r.status})`)
  if (!ok) {
    console.log(out.split('\n').slice(-30).map(l => `        ${l}`).join('\n'))
  }
  else if (opts.show) {
    console.log(out.split('\n').filter(l => /pass|test|✓|modules|Local:|built in|transformed|通过|冻结/i.test(l)).slice(-6).map(l => `        ${l.trim()}`).join('\n'))
  }
  return { ok, out }
}

// dev 解析阶段：只验证「模块能解析、构建能起」，不要求 Electron 窗口真的显示（无显示器环境）。
// 跨平台限时起 dev：Windows 无 GNU timeout，spawn 后自计时、到点杀进程树再判输出；
// 根无 dev 脚本，dev 入口在壳应用（electron-vite dev）
function devResolve(label = 'dev-resolve') {
  const t0 = Date.now()
  return new Promise((resolveP) => {
    const child = spawn('pnpm', ['--filter', '@app/shell', 'dev'], {
      cwd: WORK,
      shell: process.platform === 'win32',
      // POSIX 需要独立进程组才能负 pid 群杀；Windows 靠 taskkill /T
      detached: process.platform !== 'win32',
    })
    let out = ''
    const drain = (chunk) => { out += chunk }
    child.stdout?.on('data', drain)
    child.stderr?.on('data', drain)
    const timer = setTimeout(() => {
      // detached 进程组：POSIX 负 pid 群杀；Windows 用 taskkill 连子进程
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
      }
      else {
        try { process.kill(-child.pid, 'SIGTERM') }
        catch { child.kill('SIGTERM') }
      }
    }, 25000)
    child.on('close', () => {
      clearTimeout(timer)
      const fail = /Rolldown failed|failed to resolve|Error:\s*\[vite\]/i.test(out)
      const resolved = /modules transformed|Local:\s*http|ready in|VITE.*ready/i.test(out)
      const ok = !fail && resolved
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(16)} ${((Date.now() - t0) / 1000).toFixed(1)}s  (解析=${resolved ? 'ok' : 'n/a'}, 报错=${fail ? 'yes' : 'no'})`)
      if (!ok) { console.log(out.split('\n').slice(-25).map(l => `        ${l}`).join('\n')) }
      resolveP({ ok, out })
    })
  })
}

// 构建后不得重新出现逐包 dist（源码直引约定的反向证明）；Node 自遍历，不依赖 Unix 工具
function countDistDirs(root) {
  let count = 0
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) }
    catch { continue }
    for (const e of entries) {
      if (!e.isDirectory()) { continue }
      if (e.name === 'node_modules') { continue }
      if (e.name === 'dist') { count++ }
      else { stack.push(join(dir, e.name)) }
    }
  }
  return count
}

async function main() {
  console.log('=== 干净 clone 全链路验证 ===\n')
  const { copied, hasLock } = stageCleanTree()
  console.log(`[stage] 复制 ${copied} 个入库文件 -> ${basename(WORK)}  lockfile=${hasLock ? '有' : '无'}`)
  const ignored = ['dist', 'out', 'release', 'resources/devices']
    .filter(p => existsSync(join(WORK, p)))
  console.log(`[stage] gitignore 产物目录存在数: ${ignored.length} ${ignored.length ? `(${ignored.join(',')})` : '(干净)'}\n`)

  const results = []
  results.push(['install', run('install', 'pnpm', ['install', '--prefer-offline'], { timeout: 300000 })])
  results.push(['guard', run('guard', 'pnpm', ['guard'], { show: true })])
  results.push(['design', run('design', 'pnpm', ['check:design'], { show: true })])
  results.push(['lint', run('lint', 'pnpm', ['lint'])])
  results.push(['typecheck', run('typecheck', 'pnpm', ['typecheck'])])
  results.push(['build', run('build', 'pnpm', ['build'], { show: true })])
  results.push(['design:css', run('design:css', 'pnpm', ['check:design:css'], { show: true })])
  results.push(['dev-resolve', await devResolve()])

  // 构建后不得重新出现中间 dist（源码直引约定的反向证明）
  const distCount = existsSync(join(WORK, 'packages')) ? String(countDistDirs(join(WORK, 'packages'))) : '0'
  console.log(`\n[check] 构建后中间 dist 目录数 = ${distCount}（应为 0）`)

  const failed = results.filter(([, r]) => !r.ok).map(([n]) => n)
  console.log(`\n=== 汇总: ${results.map(([n, r]) => `${n}=${r.ok ? 0 : 1}`).join(' ')} ===`)
  if (distCount !== '0') { failed.push('dist!=0') }
  if (failed.length) {
    console.error(`[verify] 失败: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('[verify] 全绿')
  // 收尾清理同 start：dev-resolve 刚杀掉 electron 进程树，句柄释放有延迟
  cleanupWork()
}

main()

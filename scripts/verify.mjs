#!/usr/bin/env node
// 干净 clone 全链路验证：复制「git 会入库的文件」到临时目录，排除一切 gitignore 产物，
// 再跑 install → guard → design → lint → typecheck → test → e2e → build → design:css → dev 解析阶段。
// 退出码说话，结论不依赖任何人的口述；这一步专门防「沙箱里有产物、用户本地没有」。
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WORK = join(ROOT, '.verify-work')

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
}

// 只复制 git 会入库的文件（含已暂存/未跟踪但非 ignore 的），天然排除 dist/out/resources/devices
function stageCleanTree() {
  rmSync(WORK, { recursive: true, force: true })
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

// dev 解析阶段：只验证「模块能解析、构建能起」，不要求 Electron 窗口真的显示（无显示器环境）
function devResolve() {
  const t0 = Date.now()
  const r = spawnSync('timeout', ['--signal=TERM', '25s', 'pnpm', 'dev'], {
    cwd: WORK,
    encoding: 'utf8',
    timeout: 60000,
  })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const fail = /Rolldown failed|failed to resolve|Error:\s*\[vite\]/i.test(out)
  const resolved = /modules transformed|Local:\s*http|ready in|VITE.*ready/i.test(out)
  const ok = !fail && resolved
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${'dev-resolve'.padEnd(16)} ${((Date.now() - t0) / 1000).toFixed(1)}s  (解析=${resolved ? 'ok' : 'n/a'}, 报错=${fail ? 'yes' : 'no'})`)
  if (!ok) { console.log(out.split('\n').slice(-25).map(l => `        ${l}`).join('\n')) }
  return { ok, out }
}

function main() {
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
  results.push(['test', run('test', 'pnpm', ['test'], { show: true })])
  results.push(['e2e', run('e2e:update', 'pnpm', ['test:e2e:update'], { show: true })])
  results.push(['e2e:overlay', run('e2e:overlay', 'pnpm', ['test:e2e:overlay'], { show: true })])
  results.push(['e2e:permission', run('e2e:permission', 'pnpm', ['test:e2e:permission'], { show: true })])
  results.push(['e2e:resilience', run('e2e:resilience', 'pnpm', ['test:e2e:resilience'], { show: true })])
  results.push(['build', run('build', 'pnpm', ['build'], { show: true })])
  results.push(['design:css', run('design:css', 'pnpm', ['check:design:css'], { show: true })])
  results.push(['dev-resolve', devResolve()])

  // 构建后不得重新出现中间 dist（源码直引约定的反向证明）
  const distCount = existsSync(join(WORK, 'packages'))
    ? execFileSync('sh', ['-c', `find "${join(WORK, 'packages')}" -type d -name dist 2>/dev/null | wc -l`], { encoding: 'utf8' }).trim()
    : '0'
  console.log(`\n[check] 构建后中间 dist 目录数 = ${distCount}（应为 0）`)

  const failed = results.filter(([, r]) => !r.ok).map(([n]) => n)
  console.log(`\n=== 汇总: ${results.map(([n, r]) => `${n}=${r.ok ? 0 : 1}`).join(' ')} ===`)
  if (distCount !== '0') { failed.push('dist!=0') }
  if (failed.length) {
    console.error(`[verify] 失败: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('[verify] 全绿')
  rmSync(WORK, { recursive: true, force: true })
}

main()

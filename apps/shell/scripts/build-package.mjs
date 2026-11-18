/**
 * 打包编排：--flavor=<id> 写入 FLAVOR 环境（vite define 内嵌与 electron-builder 同源继承），
 * 其余参数（--win/--mac/--linux/--arm64 等）原样透传 electron-builder。
 * 无平台参数时进入交互模式（方向键选 flavor → 选平台 → 确认）；--dry-run 只打印步骤不执行。
 * 用法：pnpm package（交互）｜ pnpm build:win -- --flavor=<id>（直达）。
 * 步骤失败即中断并以该步骤退出码结束（schema 校验 → vite build + typecheck → electron-builder）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import process from 'node:process'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
let flavorId
const builderArgs = []
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg === '--') { continue }
  if (arg === '--flavor') {
    flavorId = argv[++i]
    continue
  }
  if (arg.startsWith('--flavor=')) {
    flavorId = arg.slice('--flavor='.length)
    continue
  }
  builderArgs.push(arg)
}
const dryRun = builderArgs.includes('--dry-run')
if (dryRun) { builderArgs.splice(builderArgs.indexOf('--dry-run'), 1) }

const flavorsDir = fileURLToPath(new URL('../../flavors', import.meta.url))
const available = readdirSync(flavorsDir, { withFileTypes: true })
  .filter(e => e.isDirectory() && existsSync(`${flavorsDir}/${e.name}/flavor.json`))
  .map(e => ({ id: e.name, name: JSON.parse(readFileSync(`${flavorsDir}/${e.name}/flavor.json`, 'utf-8')).name }))

if (flavorId !== undefined) {
  if (!available.some(f => f.id === flavorId)) {
    console.error(`[build] flavor 不存在: ${flavorId}（apps/flavors/ 下可用: ${available.map(f => f.id).join(' / ')}）`)
    process.exit(1)
  }
  process.env.FLAVOR = flavorId
}

const hasPlatform = builderArgs.some(a => ['--win', '--mac', '--linux', '-w', '-m', '-l'].includes(a))

/** 方向键单选菜单：↑/↓ 移动，Enter 确认，Esc 取消；返回所选 option.value */
function pick(title, options) {
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) { process.stdin.setRawMode(true) }
  let index = 0
  let drawn = 0
  return new Promise((resolve) => {
    function render(first) {
      if (!first) { process.stdout.write(`\x1B[${drawn}A\x1B[J`) }
      const lines = [`? ${title}`, ...options.map((o, i) => `${i === index ? '\x1B[36m❯\x1B[39m' : ' '} ${o.label}`)]
      process.stdout.write(`${lines.join('\n')}\n`)
      drawn = lines.length
    }
    process.stdout.write('\x1B[?25l')
    render(true)
    function onKeypress(str, key) {
      if (key.name === 'up') { index = (index - 1 + options.length) % options.length }
      else if (key.name === 'down') { index = (index + 1) % options.length }
      else if (key.name === 'return') {
        finish()
        resolve(options[index].value)
        return
      }
      else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        finish()
        process.stdout.write('\x1B[?25h')
        process.exit(0)
      }
      else { return }
      render(false)
    }
    function finish() {
      process.stdin.removeListener('keypress', onKeypress)
      if (process.stdin.isTTY) { process.stdin.setRawMode(false) }
      process.stdin.pause()
      process.stdout.write('\x1B[?25h')
    }
    process.stdin.on('keypress', onKeypress)
  })
}

if (!hasPlatform) {
  if (!process.stdin.isTTY) {
    console.error('[build] 交互模式需要终端（TTY），或显式传平台参数：--win / --mac / --linux')
    process.exit(1)
  }
  const pickedFlavor = await pick('选择产品形态（flavor）', available.map(f => ({ value: f.id, label: `${f.id}（${f.name}）` })))
  process.env.FLAVOR = pickedFlavor
  const platform = await pick('选择打包平台', [
    { value: '--win', label: 'Windows（NSIS 安装包）' },
    { value: '--mac', label: 'macOS（DMG）' },
    { value: '--linux', label: 'Linux（deb / AppImage）' },
  ])
  builderArgs.push(platform)
  console.log()
}

const genSchema = fileURLToPath(new URL('../../../scripts/gen-flavor-schema.mjs', import.meta.url))
const steps = [
  ['node', [genSchema, '--check']],
  ['pnpm', ['run', 'build']],
  ['pnpm', ['exec', 'electron-builder', ...builderArgs, '--config', 'electron-builder.config.mjs']],
]

console.log(`flavor: ${process.env.FLAVOR ?? '(未设，builder 缺省 solo-demo)'}  平台参数: ${builderArgs.join(' ')}`)
if (dryRun) {
  for (const [command, args] of steps) { console.log(`  ${command} ${args.join(' ')}`) }
  process.exit(0)
}
for (const [command, args] of steps) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) { process.exit(result.status ?? 1) }
}

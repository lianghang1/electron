#!/usr/bin/env node
// 设计系统护栏：源码纪律与构建产物语义类分开判定，退出码即结论。
// check 只查 .vue 模板，css 只在 build 之后查产物；两者都不依赖网络与第三方包。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
const cmd = args[0] || 'check'
const rootAt = args.indexOf('--root')
const ROOT = rootAt >= 0 ? resolve(args[rootAt + 1]) : DEFAULT_ROOT

const SCAN_DIRS = [join(ROOT, 'packages/ui/src'), join(ROOT, 'apps/shell/src')]
const CSS_DIR = join(ROOT, 'apps/shell/out/renderer/assets')

// 只卡「模板里直接绕过语义层」的三类写法；物理层定义处（.css）与注入点（.ts）不在此列
const SOURCE_RULES = [
  { id: 'design/physical-token', re: /var\(--dt-/, hint: '模板直接引用物理层令牌，改用语义类' },
  { id: 'design/arbitrary-size', re: /text-\[\d+px\]/, hint: '任意字号，改用 text-ui-* 阶梯' },
  { id: 'design/builtin-size', re: /text-(?:xs|sm|base|lg|xl|2xl)\b/, hint: 'Tailwind 内置字号，改用 text-ui-* 阶梯' },
]

// 实际被消费的语义类；Tailwind 按需生成，未使用的档位不列入
const REQUIRED_CLASSES = [
  'bg-background',
  'text-foreground',
  'bg-primary',
  'text-primary-foreground',
  'bg-card',
  'border-border',
  'rounded-md',
  'rounded-window',
  'rounded-icon',
  'shadow-card',
  'shadow-float',
  'shadow-window',
  'text-ui-xs',
  'text-ui-sm',
  'text-ui-caption',
  'text-ui-base',
  'text-ui-lg',
  'text-ui-display',
  'h-chrome-solo',
  'bg-overlay',
  'bg-glass',
  'bg-popover',
  'text-foreground-subtle',
  'bg-accent',
  'text-accent-foreground',
  'bg-destructive',
  'backdrop-blur-xl',
  'bg-linear-to-br',
]

// inline 生效的机器证明：工具类必须引用 var()，而不是被固化成静态值
const INLINE_RULES = [
  { cls: 'bg-primary', must: 'var(--primary)' },
  { cls: 'border-border', must: 'var(--border)' },
  { cls: 'rounded-md', must: 'var(--radius)' },
  { cls: 'shadow-card', must: 'var(--elevation-card)' },
  { cls: 'bg-overlay', must: 'var(--overlay)' },
  { cls: 'text-ui-base', must: 'var(--ui-font-size)' },
  { cls: 'text-ui-sm', must: 'calc(var(--ui-font-size)' },
]

const THEME_DEFS = [
  '--primary: var(--dt-accent)',
  '--background: var(--dt-page)',
  '--ui-font-size: 13px',
  '--dt-accent:',
  /data-theme=['"]?dark['"]?/,
]

function* vueFiles(dir) {
  if (!existsSync(dir)) { return }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { yield* vueFiles(p) }
    else if (extname(e.name) === '.vue') { yield p }
  }
}

function ruleBody(css, cls) {
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`\\.${esc}\\s*\\{([^}]*)\\}`).exec(css)
  return m ? m[1] : null
}

function loadCss() {
  if (!existsSync(CSS_DIR)) { return null }
  const file = readdirSync(CSS_DIR).find(f => f.endsWith('.css'))
  return file ? readFileSync(join(CSS_DIR, file), 'utf8') : null
}

function checkSource() {
  const bad = []
  let files = 0
  for (const dir of SCAN_DIRS) {
    for (const f of vueFiles(dir)) {
      files++
      const lines = readFileSync(f, 'utf8').split('\n')
      for (let i = 0; i < lines.length; i++) {
        for (const rule of SOURCE_RULES) {
          if (rule.re.test(lines[i])) {
            bad.push(`${rule.id}  ${relative(ROOT, f)}:${i + 1}  ${rule.hint}`)
          }
        }
      }
    }
  }
  return { files, bad }
}

function checkCss() {
  const css = loadCss()
  if (!css) { return { bad: ['未找到 renderer CSS 产物，请先执行 pnpm build'] } }
  const bad = []
  for (const cls of REQUIRED_CLASSES) {
    if (!ruleBody(css, cls)) { bad.push(`design/missing-class  .${cls} 未生成`) }
  }
  for (const { cls, must } of INLINE_RULES) {
    const body = ruleBody(css, cls)
    if (body && !body.includes(must)) {
      bad.push(`design/theme-frozen  .${cls} 未引用 ${must}（@theme inline 可能丢失）`)
    }
  }
  for (const def of THEME_DEFS) {
    const found = typeof def === 'string' ? css.includes(def) : def.test(css)
    if (!found) { bad.push(`design/missing-def  ${def} 缺失`) }
  }
  return { bad }
}

function finish(label, bad, extra) {
  if (extra) { console.log(extra) }
  if (bad.length) {
    console.error(`[design:${label}] 失败 ${bad.length} 项：`)
    for (const b of bad) { console.error(`  ${b}`) }
    process.exit(1)
  }
  console.log(`[design:${label}] 通过，0 项违规`)
}

if (cmd === 'check') {
  const { files, bad } = checkSource()
  finish('check', bad, `[design:check] 扫描 ${files} 个 .vue 模板`)
}
else if (cmd === 'css') {
  finish('css', checkCss().bad)
}
else {
  console.error('用法: check-design-system.mjs check|css [--root <dir>]')
  process.exit(2)
}

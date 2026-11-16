#!/usr/bin/env node
// 设计系统护栏：源码纪律与构建产物语义类分开判定，退出码即结论。
// check 只查 .vue 模板，css 只在 build 之后查产物；两者都不依赖网络与第三方包。
// 组件与令牌即 shadcn-vue 官方体系（slate, Tailwind v4）——本脚本守其消费纪律。
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

// 模板里禁止绕过语义层的写法：不引用自造物理令牌、不写任意字号
const SOURCE_RULES = [
  { id: 'design/physical-token', re: /var\(--dt-/, hint: '模板直接引用物理层令牌，改用官方语义类' },
  { id: 'design/arbitrary-size', re: /text-\[\d+px\]/, hint: '任意字号，改用官方字号档位' },
]

// 实际被消费的语义类；Tailwind 按需生成，未使用的档位不列入
const REQUIRED_CLASSES = [
  'bg-background',
  'bg-background\\/85',
  'text-foreground',
  'bg-primary',
  'bg-popover',
  'bg-card',
  'bg-accent',
  'border-border',
  'text-muted-foreground',
  'text-popover-foreground',
  'text-xs',
  'text-sm',
  'text-lg',
  'text-6xl',
  'rounded-md',
  'rounded-lg',
  'rounded-xl',
  'shadow-sm',
  'shadow-lg',
  'h-chrome-solo',
  'bg-destructive',
  'backdrop-blur-xl',
  'bg-linear-to-br',
]

// inline 生效的机器证明：工具类必须引用 var()（@theme inline 会把「值即 var()」
// 内联进工具类），而不是被固化成静态值；radius 系经 calc 组合，查 --radius 引用
const INLINE_RULES = [
  { cls: 'bg-primary', must: 'var(--primary)' },
  { cls: 'bg-accent', must: 'var(--accent)' },
  { cls: 'bg-popover', must: 'var(--popover)' },
  { cls: 'border-border', must: 'var(--border)' },
  { cls: 'text-muted-foreground', must: 'var(--muted-foreground)' },
  { cls: 'rounded-md', must: 'var(--radius)' },
]

// 主题定义只在源文件可查：@theme 指令在构建时被消费，不进产物
const TOKENS_CSS = join(ROOT, 'packages/ui/src/styles/tokens.css')
const THEME_DEFS = [
  '--background: oklch',
  /@theme inline/,
  /(?<![\w-])\.dark\s*\{/,
  /(?<![\w-])--radius:/,
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
  // Tailwind v4 把同族变体并入一条联合选择器（.bg-background, .bg-background\/95{...}）
  const m = new RegExp(`\\.${esc}(?:\\s*,\\s*\\.[^{}]+)*\\s*\\{([^}]*)\\}`).exec(css)
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
  const tokens = existsSync(TOKENS_CSS) ? readFileSync(TOKENS_CSS, 'utf8') : ''
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
    const re = def instanceof RegExp ? def : new RegExp(def.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    if (!re.test(tokens)) { bad.push(`design/missing-def  ${def} 缺失`) }
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

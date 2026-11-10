#!/usr/bin/env node
// 独立护栏：不依赖 eslint 规则开关、不依赖网络，干净 clone 可直接跑。
// 存量违规由 .guardrails-baseline.json 按指纹冻结，只让基线之外的新增违规失败。
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const BASELINE = join(ROOT, '.guardrails-baseline.json')
const GLOSSARY = join(ROOT, 'packages/devices/src/contracts/glossary.json')
const SCAN_EXT = new Set(['.ts', '.tsx', '.vue', '.mjs'])
const SKIP_DIR = new Set(['node_modules', 'dist', 'out', 'release', 'resources', '.git', 'guardrails'])

// 命名护栏词表来自术语表（唯一事实源），guard 与 TS 侧读同一份 JSON。
const G = JSON.parse(readFileSync(GLOSSARY, 'utf8'))
const FILENAME_TERMS = new Set(G.forbiddenFilenameTerms)
const STRUCTURE_TERMS = new Set(G.forbiddenStructureTerms)

// 依赖层：数字越大越靠外。底层禁止 import 高层；渲染层（ui）只允许 bridge + shared。
const LAYER = {
  '@shell/shared': 0,
  '@shell/kernel': 1,
  '@shell/bridge': 2,
  '@shell/devices': 2,
  '@shell/update': 2,
  '@shell/window': 2,
  '@shell/app-runtime': 2,
  '@shell/ui': 3,
  '@app/shell': 4,
}
const UI_ALLOW = new Set(['@shell/bridge', '@shell/shared'])

// 只登记「机器可精确判定」的过程性/自夸/占位词。领域术语（接入方式/落地/新增厂商）不在此列。
const COMMENT_RULES = [
  { id: 'comment/milestone', re: /(?:\bM[2-9](?:-[A-Z])?\b|里程碑|批次)/ },
  { id: 'comment/timeline', re: /(?:本轮|本次|此前|曾在|曾出现在|现已|先立|接管后|后续再|待落地|随里程碑|上一版|下一版再)/ },
  { id: 'comment/self-praise', re: /铁律/ },
  { id: 'comment/placeholder', re: /(?:预留|骨架|占位|\bTBD\b|\bTODO\b|\bFIXME\b)/ },
]
const ESCAPE_RE = /\bas\s+never\b|\bas\s+any\b|\bas\s+unknown\s+as\b|@ts-ignore|@ts-expect-error/
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*)/

function* walk(dir) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) }
  catch { return }
  for (const e of entries) {
    if (SKIP_DIR.has(e.name)) { continue }
    const p = join(dir, e.name)
    if (e.isDirectory()) { yield* walk(p) }
    else if (SCAN_EXT.has(extname(e.name))) { yield p }
  }
}

function sourceFiles() {
  const out = []
  for (const root of ['packages', 'apps']) {
    const base = join(ROOT, root)
    if (existsSync(base)) {
      for (const f of walk(base)) { out.push(f) }
    }
  }
  return out
}

function rel(f) { return relative(ROOT, f).replace(/\\/g, '/') }
function fingerprint(rule, file, text) {
  return createHash('sha1').update(`${rule}|${file}|${text.trim().replace(/\s+/g, ' ')}`).digest('hex').slice(0, 16)
}
function push(list, rule, file, line, text) {
  list.push({ rule, file: rel(file), line, text: text.trim().slice(0, 160), fp: fingerprint(rule, rel(file), text) })
}
function packageOf(file) {
  const r = rel(file)
  const m = r.match(/^packages\/([^/]+)\//)
  return m ? `@shell/${m[1]}` : '@app/shell'
}

function scanSource() {
  const v = []
  for (const f of sourceFiles()) {
    const lines = readFileSync(f, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (COMMENT_LINE_RE.test(line)) {
        for (const { id, re } of COMMENT_RULES) {
          if (re.test(line)) { push(v, id, f, i + 1, line) }
        }
      }
      if (ESCAPE_RE.test(line)) { push(v, 'type/escape', f, i + 1, line) }

      const im = line.match(/from\s+['"](@shell\/[\w-]+|@app\/[\w-]+)['"]/)
      if (im) {
        const target = im[1]
        const from = packageOf(f)
        const fromLayer = LAYER[from] ?? 0
        const toLayer = LAYER[target] ?? 0
        if (toLayer > fromLayer && fromLayer <= 1) {
          push(v, 'boundary/upward-import', f, i + 1, line)
        }
        if (from === '@shell/ui' && !UI_ALLOW.has(target)) {
          push(v, 'boundary/ui-layer', f, i + 1, line)
        }
      }
    }
  }
  return v
}

function scanPackages() {
  const v = []
  const pkgs = []
  for (const d of readdirSync(join(ROOT, 'packages'))) {
    const f = join(ROOT, 'packages', d, 'package.json')
    if (!existsSync(f)) { continue }
    const p = JSON.parse(readFileSync(f))
    const deps = Object.keys(p.dependencies || {}).filter(k => k.startsWith('@shell/'))
    pkgs.push({ name: p.name, dir: join(ROOT, 'packages', d), deps })
  }
  // 循环依赖：双向 workspace 声明
  for (const a of pkgs) {
    for (const b of pkgs) {
      if (a.name !== b.name && a.deps.includes(b.name) && b.deps.includes(a.name)
        && a.name < b.name) {
        const pf = join(a.dir, 'package.json')
        push(v, 'boundary/cyclic-dependency', pf, 1, `${a.name} <-> ${b.name}`)
      }
    }
  }
  // 幽灵依赖：声明了内部包但源码零 import
  for (const a of pkgs) {
    for (const dep of a.deps) {
      let used = false
      for (const f of walk(a.dir)) {
        if (f.endsWith('package.json')) { continue }
        const text = readFileSync(f, 'utf8')
        if (text.includes(`'${dep}`) || text.includes(`"${dep}`)) {
          used = true
          break
        }
      }
      if (!used) {
        const pf = join(a.dir, 'package.json')
        push(v, 'boundary/ghost-dependency', pf, 1, `${a.name}: ${dep} 声明但零引用`)
      }
    }
  }
  return v
}

// 设备骨架护栏：规则只作用于 packages/devices/src/domains，全部机器可精确判定。
// 存量违规由 baseline 冻结（即 P2 施工清单）；六域搬迁消除后重新收紧到零。
const DEVICE_DOMAINS = ['print', 'capture', 'idcard', 'iccard', 'scanner', 'signature']
const REQUIRED_DOMAIN_FILES = ['domain.ts', 'methods.ts', 'index.ts', 'channels/registry.ts']
const DUAL_TRACK_RE = /@deprecated|别名导出|待迁移|TODO 迁移/

/** 文件名按分隔符拆词，命中零信息量词即报（如 domain-kit / channel-types）。 */
function bannedFilenameHit(filename) {
  const stem = filename.replace(/\.(ts|tsx|vue|mjs)$/, '')
  return stem.split(/[-_.]/).find(w => FILENAME_TERMS.has(w.toLowerCase()))
}

/** 导出结构名里出现被禁同义结构词（setting/adapter/override）。 */
function bannedStructureHit(line) {
  const m = line.match(/export\s+(?:interface|type|class|enum|const)\s+([A-Za-z][A-Za-z0-9]*)/)
  if (!m) { return undefined }
  const words = m[1].replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_]+/)
  return words.find(w => STRUCTURE_TERMS.has(w))
}

function scanDeviceRules() {
  const v = []
  const domainsRoot = join(ROOT, 'packages/devices/src/domains')
  // 目录形状：每个能力域必须具备定稿四文件
  for (const domain of DEVICE_DOMAINS) {
    for (const file of REQUIRED_DOMAIN_FILES) {
      const target = join(domainsRoot, domain, file)
      if (!existsSync(target)) {
        push(v, 'device/structure', target, 0, `缺少 ${domain}/${file}`)
      }
    }
  }
  // 逐文件逐行：平台分支 / 自建机制 / 双轨 / 命名禁用词
  for (const f of walk(domainsRoot)) {
    const r = rel(f)
    if (r.endsWith('.test.ts')) { continue }
    const isPlatformData = r.includes('/domains/platform/')
    const fileHit = bannedFilenameHit(f.split('/').pop() ?? '')
    if (fileHit) { push(v, 'device/banned-filename', f, 0, `文件名含禁用词：${fileHit}`) }
    const lines = readFileSync(f, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!isPlatformData && /process\.platform|process\.env\.OS/.test(line)) {
        push(v, 'device/platform-branch', f, i + 1, line)
      }
      if (/class\s+\w*Error\w*\s+(?:extends|implements)\s+Error|extends Error/.test(line)) {
        push(v, 'device/duplicate-error', f, i + 1, line)
      }
      if (/with-timeout|withTimeout/.test(line)) {
        push(v, 'device/duplicate-timeout', f, i + 1, line)
      }
      if (/overridesStore\(/.test(line)) {
        push(v, 'device/duplicate-store', f, i + 1, line)
      }
      if (DUAL_TRACK_RE.test(line)) {
        push(v, 'device/dual-track', f, i + 1, line)
      }
      const structHit = bannedStructureHit(line)
      if (structHit) { push(v, 'device/banned-structure-name', f, i + 1, `结构名含禁用词：${structHit} :: ${line.trim().slice(0, 80)}`) }
    }
  }
  return v
}

function allViolations() {
  return [...scanSource(), ...scanPackages(), ...scanDeviceRules()]
}

function changedFiles() {
  try {
    const base = execFileSync('git', ['merge-base', 'HEAD', 'master'], { cwd: ROOT, encoding: 'utf8' }).trim()
    const args = base ? ['diff', '--name-only', `${base}..HEAD`] : ['diff', '--name-only', 'HEAD~1..HEAD']
    const out = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    return new Set(out.split('\n').filter(Boolean).map(f => f.replace(/\\/g, '/')))
  }
  catch {
    return null
  }
}

function loadBaseline() {
  if (!existsSync(BASELINE)) { return new Set() }
  try { return new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).fingerprints || []) }
  catch { return new Set() }
}

function cmdCheck() {
  const changed = process.argv.includes('--changed') ? changedFiles() : null
  const baseline = loadBaseline()
  const all = allViolations()
  const scoped = changed ? all.filter(v => changed.has(v.file)) : all
  const fresh = scoped.filter(v => !baseline.has(v.fp))
  const seen = new Set(all.map(v => v.fp))
  const stale = [...baseline].filter(fp => !seen.has(fp)).length

  if (fresh.length) {
    console.error(`[guard] ${fresh.length} 条新增违规（存量已冻结，仅新增失败）：\n`)
    for (const v of fresh) { console.error(`  ${v.file}:${v.line}  ${v.rule}\n      ${v.text}`) }
    console.error('')
    process.exit(1)
  }
  console.log(`[guard] 通过：扫描 ${all.length} 条候选，基线冻结 ${baseline.size} 条，范围=${changed ? `${changed.size} 个改动文件` : '全量'}，新增违规 0`)
  if (stale) { console.log(`[guard] 提示：基线中有 ${stale} 条违规已消失，可运行 pnpm guard:baseline 收紧`) }
}

function cmdBaseline() {
  const all = allViolations()
  const fps = [...new Set(all.map(v => v.fp))].sort()
  writeFileSync(BASELINE, `${JSON.stringify({ version: 1, generatedBy: 'pnpm guard:baseline', fingerprints: fps }, null, 2)}\n`)
  console.log(`[guard] 基线已写入 ${fps.length} 条指纹 -> ${rel(BASELINE)}`)
}

// 死代码报告：只报告、不阻断（公开出口天然无仓内引用，避免误报炸场）
function cmdDead() {
  const exported = new Map()
  const imported = new Set()
  for (const f of sourceFiles()) {
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(/export\s+(?:const|function|class|interface|type|enum)\s+([\w$]+)/g)) {
      if (!exported.has(m[1])) { exported.set(m[1], { file: rel(f), line: text.slice(0, m.index).split('\n').length }) }
    }
    for (const m of text.matchAll(/import\s+(?:type\s+)?(?:\{[^}]*\}|[\w$]+)\s+from\s+['"]([^'"]+)['"]/g)) {
      for (const name of m[0].matchAll(/[\w$]+/g)) { imported.add(name[0]) }
    }
  }
  const dead = [...exported].filter(([name]) => !imported.has(name))
  console.log(`[guard:dead] ${exported.size} 个具名导出，其中 ${dead.length} 个无仓内 import（公开出口属正常，仅作排查线索）：`)
  for (const [name, at] of dead.slice(0, 60)) { console.log(`  ${name.padEnd(32)} ${at.file}:${at.line}`) }
}

// 全量违规明细：机器可消费，用于存量清账；只报告、不判定成败
function cmdList() {
  const all = allViolations()
  for (const v of all) {
    console.log(`${v.rule.padEnd(28)} ${v.file}:${v.line}  ${v.text.slice(0, 140)}`)
  }
  console.log(`\n[guard:list] 共 ${all.length} 条`)
}

// 设备骨架专项清单：只报告、不判定成败，供 P2 搬迁逐项销账。
function cmdDevices() {
  const all = scanDeviceRules()
  const byRule = new Map()
  for (const v of all) {
    byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1)
  }
  console.log(`[guard:devices] 设备骨架违规 ${all.length} 条：`)
  for (const [rule, n] of [...byRule].sort()) { console.log(`  ${rule.padEnd(30)} ${n}`) }
  for (const v of all) { console.log(`  ${v.rule.padEnd(30)} ${v.file}:${v.line}`) }
}

const cmd = process.argv[2] || 'check'
if (cmd === 'check') {
  cmdCheck()
}
else if (cmd === 'baseline') {
  cmdBaseline()
}
else if (cmd === 'dead') {
  cmdDead()
}
else if (cmd === 'list') {
  cmdList()
}
else if (cmd === 'devices') {
  cmdDevices()
}
else { console.error(`用法: guard.mjs check [--changed] | baseline | dead | list | devices`); process.exit(2) }

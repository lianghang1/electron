#!/usr/bin/env node
// devconsole 应用目录与主进程能力定义的方法名机器比对：
// 应用 catalog.js 的域.方法集合必须与设备五域 methods.ts 顶层方法、info 域定义、
// 壳设施路由（app/notification/download/update）严格一致——主进程加删方法而应用
// 目录未同步时，此处退出非零。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CATALOG = join(ROOT, 'resources/apps/devconsole/js/catalog.js')
const METHODS_DIR = join(ROOT, 'packages/devices/src/domains')
const DOMAIN_FILES = ['print', 'capture', 'idcard', 'iccard', 'scanner']
const INFO_DOMAIN = join(ROOT, 'apps/shell/electron/main/ipc/info-domain.ts')
const FACILITY_ROUTER = join(ROOT, 'apps/shell/electron/main/ipc/facility-router.ts')
const FACILITY_DOMAINS = ['app', 'notification', 'download', 'update']

const problems = []

/** defineDomain 调用对象的方法键提取：按缩进层级扫行，域行（2 空格）复位收集容器。 */
function collectByIndent(lines, domainPattern, methodPattern) {
  const result = new Map()
  let domain = null
  for (const line of lines) {
    const domainMatch = domainPattern.exec(line)
    if (domainMatch) {
      domain = domainMatch[1]
      result.set(domain, new Set())
      continue
    }
    const methodMatch = methodPattern.exec(line)
    if (domain && methodMatch) { result.get(domain).add(methodMatch[1]) }
  }
  return result
}

const DOMAIN_LINE = /^ {2}(\w+): \{\r?$/
const CATALOG_METHOD_LINE = /^ {6}(\w+): \{/
const DOMAIN_METHOD_LINE = /^ {4}(\w+): \{\r?$/

/** catalog.js：应用侧桥面目录（域 → 方法集合）。文本提取，避免 node 对无 type 仓的 .js 解析歧义。 */
function parseCatalog() {
  return collectByIndent(readFileSync(CATALOG, 'utf-8').split('\n'), DOMAIN_LINE, CATALOG_METHOD_LINE)
}

/** 域 methods.ts：主进程侧该域的顶层方法键（4 空格缩进，无域分组）。 */
function parseDomainMethods(domain) {
  const names = new Set()
  for (const line of readFileSync(join(METHODS_DIR, domain, 'methods.ts'), 'utf-8').split('\n')) {
    const m = DOMAIN_METHOD_LINE.exec(line)
    if (m) { names.add(m[1]) }
  }
  return names
}

/** info 域：defineDomain('info', {...}) 块内的方法键。 */
function parseInfoMethods() {
  const names = new Set()
  let inside = false
  for (const line of readFileSync(INFO_DOMAIN, 'utf-8').split('\n')) {
    if (/defineDomain\('info', \{/.test(line)) {
      inside = true
      continue
    }
    if (inside && /^ {4}\}\)\s*$/.test(line)) { break }
    const m = DOMAIN_METHOD_LINE.exec(line)
    if (inside && m) { names.add(m[1]) }
  }
  return names
}

/** 壳设施域：facility-router.ts 的 FACILITY_ROUTES 字面量内方法键（域行 2 空格 / 方法行 4 空格）。 */
function parseFacilityMethods(domain) {
  const lines = readFileSync(FACILITY_ROUTER, 'utf-8').split('\n')
  const start = lines.findIndex(l => l.startsWith('const FACILITY_ROUTES'))
  const end = lines.findIndex(l => l.includes('} satisfies'))
  return collectByIndent(lines.slice(start, end), DOMAIN_LINE, DOMAIN_METHOD_LINE).get(domain) ?? new Set()
}

if (!existsSync(CATALOG)) {
  console.error(`[catalog-check] 应用目录缺失: ${CATALOG}`)
  process.exit(1)
}

const catalog = parseCatalog()
const expected = new Map([
  ['info', parseInfoMethods()],
  ...DOMAIN_FILES.map(d => [d, parseDomainMethods(d)]),
  ...FACILITY_DOMAINS.map(d => [d, parseFacilityMethods(d)]),
])

for (const [domain, methods] of expected) {
  const actual = catalog.get(domain)
  if (!actual) {
    problems.push(`catalog 缺域 ${domain}`)
    continue
  }
  for (const name of methods) {
    if (!actual.has(name)) { problems.push(`catalog 缺方法 ${domain}.${name}`) }
  }
  for (const name of actual) {
    if (!methods.has(name)) { problems.push(`catalog 多出方法 ${domain}.${name}（主进程域定义中不存在）`) }
  }
}
for (const domain of catalog.keys()) {
  if (!expected.has(domain)) { problems.push(`catalog 多出域 ${domain}`) }
}

if (problems.length) {
  console.error(`[catalog-check] ${problems.length} 处漂移：`)
  for (const p of problems) { console.error(`  - ${p}`) }
  process.exit(1)
}
const total = [...expected.values()].reduce((n, s) => n + s.size, 0)
console.log(`[catalog-check] 对齐：${expected.size} 域 / ${total} 方法`)

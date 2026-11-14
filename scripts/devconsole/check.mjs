#!/usr/bin/env node
// devconsole 护栏入口：方法目录对齐 + JSDoc 类型检查（纯检查不产物）。verify 链的一个阶段。
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const HERE = dirname(fileURLToPath(import.meta.url))
const TSC = join(ROOT, 'node_modules/typescript/bin/tsc')

const catalog = spawnSync('node', [join(HERE, 'catalog-check.mjs')], { encoding: 'utf8', shell: false })
process.stdout.write(catalog.stdout)
process.stderr.write(catalog.stderr)
if (catalog.status !== 0) { process.exit(catalog.status ?? 1) }

const types = spawnSync('node', [TSC, '--noEmit', '-p', 'resources/apps/devconsole/tsconfig.json'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: false,
})
if (types.stdout?.trim()) { console.log(types.stdout.trim()) }
if (types.stderr?.trim()) { console.error(types.stderr.trim()) }
if (types.status !== 0) {
  console.error('[devconsole-check] JSDoc 类型检查失败')
  process.exit(types.status ?? 1)
}
console.log('[devconsole-check] 全部通过')

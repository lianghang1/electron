#!/usr/bin/env node
// flavor.json 作者体验：从 @shell/shared 的 zod 契约生成 apps/flavors/flavor.schema.json
// （编辑器补全/必填星标/枚举下拉/悬停文档），并用同一契约校验全部 flavor.json——
// dev 装配、打包前、verify 漂移检查三处共用单一事实源。
// 契约是 TS 源码（workspace 直引无构建层），依赖 Node >= 22.18 原生类型剥离直接加载。
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SCHEMA_PATH = join(ROOT, 'apps/flavors/flavor.schema.json')

if (!process.features.typescript) {
  console.error(`[flavor-schema] 需要 Node >= 22.18（原生类型剥离）加载 zod 契约，当前 ${process.version}；schema 文件已入库，可跳过本检查`)
  process.exit(1)
}

const { flavorJsonSchema, parseFlavorManifest } = await import('../packages/shared/src/manifest.ts')

const rendered = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...flavorJsonSchema(),
}, null, 2)}\n`

const flavorsDir = join(ROOT, 'apps/flavors')
const flavorDirs = readdirSync(flavorsDir, { withFileTypes: true }).filter(e => e.isDirectory())
let invalid = 0
for (const dir of flavorDirs) {
  const file = join(flavorsDir, dir.name, 'flavor.json')
  if (!existsSync(file)) { continue }
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf-8'))
  }
  catch (err) {
    console.error(`[flavor-schema] ${dir.name}/flavor.json JSON 解析失败: ${err.message}`)
    invalid++
    continue
  }
  try {
    parseFlavorManifest(raw)
    console.log(`[flavor-schema] PASS ${dir.name}`)
  }
  catch (err) {
    console.error(`[flavor-schema] FAIL ${dir.name}/flavor.json:\n${err.message}`)
    invalid++
  }
}
if (invalid > 0) { process.exit(1) }

if (process.argv.includes('--check')) {
  const current = existsSync(SCHEMA_PATH) ? readFileSync(SCHEMA_PATH, 'utf-8') : ''
  if (current !== rendered) {
    console.error('[flavor-schema] schema 与 zod 契约不一致：运行 pnpm gen:flavor-schema 重新生成后入库')
    process.exit(1)
  }
  console.log('[flavor-schema] schema 无漂移')
  process.exit(0)
}

writeFileSync(SCHEMA_PATH, rendered)
console.log(`[flavor-schema] 已生成 apps/flavors/flavor.schema.json（${flavorDirs.length} 个 flavor 校验通过）`)

/**
 * apps.json 本地应用源 e2e：文件缺失/畸形 JSON/非数组返回空表、合法解析、
 * 无效项跳过、重复 id 去重、内置 id 排除，以及生产用权限规则函数生成策略表。
 *
 * 运行：pnpm test:e2e:apps-source
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { loadAppsJson } from '../../packages/app-runtime/src/app-source.ts'
import { buildAppPermissionRules } from '../../packages/app-runtime/src/permission-rules.ts'
import { appManifestSchema, flavorManifestSchema } from '../../packages/shared/src/manifest.ts'

let passed = 0
let failed = 0

async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  PASS  ${name}`)
  }
  catch (err) {
    failed++
    console.log(`  FAIL  ${name}\n        ${err?.message ?? err}`)
  }
}

const warnings = []
const logger = {
  warn: (...args) => warnings.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
  info: () => {},
  error: () => {},
  debug: () => {},
}
const validApp = {
  id: 'clinic-reg',
  name: '登记台',
  version: '1.0.0',
  entry: { kind: 'embedded', route: '/clinic/reg' },
  devices: ['idcard'],
  permissions: ['notifications'],
}
const otherApp = {
  id: 'print-desk',
  name: '打印台',
  version: '1.0.0',
  entry: { kind: 'embedded', route: '/clinic/print' },
  devices: [],
  permissions: [],
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'apps-src-'))
  try { return fn(dir) }
  finally { rmSync(dir, { recursive: true, force: true }) }
}

await step('文件缺失 → 空表且不告警', () => withDir((dir) => {
  warnings.length = 0
  assert.deepEqual(loadAppsJson(dir, logger), [])
  assert.equal(warnings.length, 0)
}))

await step('畸形 JSON / 非数组顶层 → 空表并告警', () => withDir((dir) => {
  writeFileSync(join(dir, 'apps.json'), '{not json')
  assert.deepEqual(loadAppsJson(dir, logger), [])
  writeFileSync(join(dir, 'apps.json'), '{"id":1}')
  assert.deepEqual(loadAppsJson(dir, logger), [])
  assert.ok(warnings.length >= 2)
}))

await step('合法清单解析通过，devices/permissions 字段保留', () => withDir((dir) => {
  writeFileSync(join(dir, 'apps.json'), JSON.stringify([validApp]))
  const apps = loadAppsJson(dir, logger)
  assert.equal(apps.length, 1)
  assert.equal(apps[0].id, 'clinic-reg')
  assert.deepEqual(apps[0].devices, ['idcard'])
  assert.deepEqual(apps[0].permissions, ['notifications'])
}))

await step('无效项跳过并计数告警，合法项不受牵连', () => withDir((dir) => {
  writeFileSync(join(dir, 'apps.json'), JSON.stringify([validApp, { id: 'broken' }, 'not-an-object']))
  const apps = loadAppsJson(dir, logger)
  assert.equal(apps.length, 1)
  assert.ok(warnings.some(w => w.includes('跳过 2 个')))
}))

await step('重复 id 只保留首个', () => withDir((dir) => {
  writeFileSync(join(dir, 'apps.json'), JSON.stringify([validApp, { ...validApp, name: '重复项' }]))
  const apps = loadAppsJson(dir, logger)
  assert.equal(apps.length, 1)
  assert.equal(apps[0].name, '登记台')
}))

await step('excludeIds 排除内置清单占用的 id', () => withDir((dir) => {
  writeFileSync(join(dir, 'apps.json'), JSON.stringify([validApp, otherApp]))
  const apps = loadAppsJson(dir, logger, { excludeIds: ['clinic-reg'] })
  assert.deepEqual(apps.map(a => a.id), ['print-desk'])
  assert.ok(warnings.some(w => w.includes('跳过 1 个')))
}))

await step('生产权限规则函数：内置 + 本地扩展清单生成完整策略表', () => {
  const flavor = flavorManifestSchema.parse({ id: 'demo', name: 'Demo', apps: [validApp] })
  const local = appManifestSchema.parse(otherApp)
  assert.deepEqual(buildAppPermissionRules([...flavor.apps, local]), [
    { app: 'clinic-reg', permission: 'app.open', verdict: 'allow' },
    { app: 'clinic-reg', permission: 'domain.idcard', verdict: 'allow' },
    { app: 'clinic-reg', permission: 'notifications', verdict: 'allow' },
    { app: 'print-desk', permission: 'app.open', verdict: 'allow' },
  ])
})

await step('同 id 只生成一份规则，未声明项不产生规则', () => {
  const flavor = flavorManifestSchema.parse({ id: 'demo', name: 'Demo', apps: [validApp] })
  const rules = buildAppPermissionRules([...flavor.apps, { ...validApp, name: '重名项' }, otherApp])
  assert.equal(rules.filter(r => r.app === 'clinic-reg').length, 3)
  assert.equal(rules.filter(r => r.app === 'print-desk').length, 1)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)

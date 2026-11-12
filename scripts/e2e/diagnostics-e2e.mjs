/**
 * 调试台清单防漂移 e2e：清单 ↔ 真实域定义双向比对 + 默认入参跑真实 zod schema。
 *
 * 运行：pnpm test:e2e:diagnostics
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createCaptureDomain } from '../../packages/devices/src/domains/capture/domain.ts'
import { createIccardDomain } from '../../packages/devices/src/domains/iccard/domain.ts'
import { createIdcardDomain } from '../../packages/devices/src/domains/idcard/domain.ts'
import { createPrintDomain } from '../../packages/devices/src/domains/print/domain.ts'
import { createScannerDomain } from '../../packages/devices/src/domains/scanner/domain.ts'
import { createSignatureDomain } from '../../packages/devices/src/domains/signature/domain.ts'
import { DEVICE_CAPABILITY_IDS } from '../../packages/shared/src/capability.ts'
import { buildDiagnosticInput, DIAGNOSTIC_CATALOG, diagnosticDefaults, diagnosticMethodKeys } from '../../packages/shared/src/diagnostics.ts'
import { flavorManifestSchema } from '../../packages/shared/src/manifest.ts'
import { DIAGNOSTIC_SCENARIOS, fieldVisible, SCENARIO_CAPABILITY_IDS, scenarioDefaults, scenarioInput } from '../../packages/shared/src/scenarios.ts'

let passed = 0
let failed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    process.stdout.write(`  PASS  ${name}\n`)
  }
  catch (err) {
    failed++
    process.stdout.write(`  FAIL  ${name}: ${err.message}\n`)
  }
}

// 域工厂只在构造期把方法收集进表，handler 不执行，故可传空桩拿到真实定义
const stub = {}
const deps = { events: { emit() {} }, demoMode: { enabled: true } }
const domains = [
  createIdcardDomain(stub),
  createIccardDomain(stub),
  createPrintDomain(stub),
  createScannerDomain(stub, deps),
  createCaptureDomain(stub, deps),
  createSignatureDomain(stub, deps),
]

/** 真实定义："域.方法" → input schema */
const real = new Map()
for (const domain of domains) {
  for (const [name, def] of Object.entries(domain.methods)) {
    real.set(`${domain.name}.${name}`, def)
  }
}

process.stdout.write('\n调试台清单防漂移 e2e\n\n')

await step('清单键唯一，无重复方法', () => {
  const keys = diagnosticMethodKeys()
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(keys.length, 38)
})

await step('清单每个方法都存在于真实域定义', () => {
  for (const key of diagnosticMethodKeys()) {
    assert.ok(real.has(key), `清单里的方法在真实域定义中不存在：${key}`)
  }
})

await step('真实域定义的每个方法都在清单中（防漏）', () => {
  const catalog = new Set(diagnosticMethodKeys())
  for (const key of real.keys()) {
    assert.ok(catalog.has(key), `真实域定义的方法未列入清单：${key}`)
  }
})

await step('清单域名与真实域名一一对应', () => {
  const catalogDomains = DIAGNOSTIC_CATALOG.map(d => d.name).sort()
  const realDomains = [...new Set(domains.map(d => d.name))].sort()
  assert.deepEqual(catalogDomains, realDomains)
})

await step('每个方法的默认入参都通过真实 zod schema', () => {
  for (const domain of DIAGNOSTIC_CATALOG) {
    for (const method of domain.methods) {
      const def = real.get(`${domain.name}.${method.name}`)
      const input = buildDiagnosticInput(method.fields, diagnosticDefaults(method.fields))
      const parsed = def.input.safeParse(input)
      assert.equal(parsed.success, true, `${domain.name}.${method.name} 默认入参不合法：${JSON.stringify(parsed.error?.flatten?.() ?? input)}`)
    }
  }
})

await step('危险操作已标注，只读操作无 dangerous 标记', () => {
  const dangerous = DIAGNOSTIC_CATALOG.flatMap(d => d.methods.filter(m => m.dangerous).map(m => `${d.name}.${m.name}`))
  assert.deepEqual(dangerous.sort(), ['iccard.writeSector', 'iccard.writeTextBlocks', 'print.clearPrintJobs', 'print.removePrintJob'])
  for (const domain of DIAGNOSTIC_CATALOG) {
    for (const method of domain.methods) {
      if (method.readOnly) { assert.equal(method.dangerous, undefined, `${domain.name}.${method.name} 只读却标了危险`) }
    }
  }
})

await step('流式事件名都在平台事件契约白名单内', () => {
  const allowed = new Set(['capture.frame', 'scanner.scanned', 'signature.stroke'])
  const events = DIAGNOSTIC_CATALOG.flatMap(d => d.methods.map(m => m.event).filter(Boolean))
  assert.ok(events.length > 0)
  for (const event of events) { assert.ok(allowed.has(event), `未知事件：${event}`) }
})

await step('$input 的 json 字段作为整个入参对象，非字符串键正常组装', () => {
  const input = buildDiagnosticInput(
    [{ key: '$input', label: 'x', kind: 'json', default: '{"a":1}' }],
    { $input: '{"a":1}' },
  )
  assert.deepEqual(input, { a: 1 })
  const mixed = buildDiagnosticInput(
    [
      { key: 'sectorNumber', label: '扇区', kind: 'number', default: 1 },
      { key: 'textBlocks', label: '文本', kind: 'json', default: '["a"]' },
    ],
    { sectorNumber: 3, textBlocks: '["a","b"]' },
  )
  assert.deepEqual(mixed, { sectorNumber: 3, textBlocks: ['a', 'b'] })
})

await step('无字段方法返回 undefined（与 noInput schema 一致）', () => {
  assert.equal(buildDiagnosticInput([], {}), undefined)
})

// 验机场景目录：能力覆盖、方法引用、字段引用、各内容形态默认入参过真实 schema
const SAMPLE = {
  filePath: 'C:/sample/report.pdf',
  fileUrl: 'https://example.com/report.pdf',
  imageDataUrl: 'data:image/png;base64,AAAA',
  deviceId: 'dev-1',
}

await step('验机场景目录覆盖全部能力，且域与产品声明一致', () => {
  assert.deepEqual([...SCENARIO_CAPABILITY_IDS].sort(), [...DEVICE_CAPABILITY_IDS].sort())
  assert.equal(Object.keys(DIAGNOSTIC_SCENARIOS).length, DEVICE_CAPABILITY_IDS.length)
  for (const id of DEVICE_CAPABILITY_IDS) {
    assert.equal(DIAGNOSTIC_SCENARIOS[id].capabilityId, id)
  }
})

await step('场景动作引用的方法与字段都在真实定义 / 字段表内', () => {
  const realKeys = new Set(real.keys())
  for (const spec of Object.values(DIAGNOSTIC_SCENARIOS)) {
    const keys = new Set(spec.fields.map(f => f.key))
    if (spec.deviceMethod) { assert.ok(realKeys.has(spec.deviceMethod), `设备枚举方法不存在：${spec.deviceMethod}`) }
    for (const action of spec.actions) {
      assert.ok(realKeys.has(action.method), `场景动作方法不存在：${action.method}`)
      for (const key of action.fields) { assert.ok(keys.has(key), `${action.id} 引用未登记字段 ${key}`) }
    }
  }
})

await step('每个场景动作在每种内容形态下的入参都通过真实 zod schema', () => {
  for (const spec of Object.values(DIAGNOSTIC_SCENARIOS)) {
    for (const kind of spec.kinds) {
      const values = { ...scenarioDefaults(spec.fields), ...SAMPLE }
      for (const action of spec.actions) {
        const input = scenarioInput(spec, action, values, kind.id)
        const def = real.get(action.method)
        const parsed = def.input.safeParse(input)
        assert.equal(parsed.success, true, `${spec.capabilityId}/${kind.id}/${action.id} 入参不合法：${JSON.stringify(parsed.error?.flatten?.() ?? input)}`)
      }
    }
  }
})

await step('打印四种内容形态组装出正确的负载判别联合', () => {
  const spec = DIAGNOSTIC_SCENARIOS.print
  const submit = spec.actions.find(a => a.id === 'submit')
  const values = { ...scenarioDefaults(spec.fields), ...SAMPLE }
  const expectKind = { image: 'file', pdf: 'file', pdfurl: 'url', html: 'html' }
  for (const kind of spec.kinds) {
    const input = scenarioInput(spec, submit, values, kind.id)
    assert.equal(input.printContent.kind, expectKind[kind.id], `${kind.id} 负载类型不符`)
    assert.equal(typeof input.printOptions.paper, 'string')
  }
})

await step('字段可见性按内容形态收窄，PDF 专有参数不出现在 HTML 形态', () => {
  const spec = DIAGNOSTIC_SCENARIOS.print
  const visible = id => spec.fields.filter(f => fieldVisible(f, id)).map(f => f.key)
  assert.ok(visible('html').includes('htmlData'))
  assert.ok(!visible('html').includes('filePath'))
  assert.ok(visible('pdf').includes('scale'))
  assert.ok(!visible('html').includes('scale'))
  assert.ok(!visible('image').includes('fileUrl'))
})

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const flavorsDir = join(ROOT, 'apps/flavors')

function flavorIds() {
  return readdirSync(flavorsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

function readFlavor(id) {
  const file = join(flavorsDir, id, 'flavor.json')
  assert.ok(existsSync(file), `${id} 缺少 flavor.json`)
  return flavorManifestSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
}

await step('全部 flavor.json 通过生产 schema 解析且 id 与目录一致', () => {
  const ids = flavorIds()
  assert.ok(ids.includes('diagnostics'))
  for (const id of ids) { assert.equal(readFlavor(id).id, id) }
})

await step('仅 diagnostics flavor 开启验机开关，生产形态一律关闭', () => {
  for (const id of flavorIds()) {
    assert.equal(readFlavor(id).diagnostics, id === 'diagnostics', `${id} 的验机开关不符合隔离约定`)
  }
  const flavor = readFlavor('diagnostics')
  assert.equal(flavor.mode, 'desktop')
  assert.equal(flavor.chrome, 'platform')
  assert.equal(flavor.defaultAppId, 'diagnostics')
})

await step('diagnostics flavor 的 embedded 路由在渲染层已注册', () => {
  const app = readFlavor('diagnostics').apps.find(a => a.entry.kind === 'embedded')
  assert.ok(app, '调试台应用未声明 embedded 入口')
  const entry = readFileSync(join(ROOT, 'apps/shell/src/main.ts'), 'utf8')
  assert.ok(
    entry.includes(`registerEmbeddedApp('${app.entry.route}', DiagnosticsApp)`),
    `渲染层未注册 ${app.entry.route}`,
  )
})

await step('diagnostics flavor 声明的硬件域与方法清单域名一致', () => {
  const declared = readFlavor('diagnostics').apps.flatMap(a => a.devices).sort()
  assert.deepEqual(declared, DIAGNOSTIC_CATALOG.map(d => d.name).sort())
})

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exitCode = failed > 0 ? 1 : 0

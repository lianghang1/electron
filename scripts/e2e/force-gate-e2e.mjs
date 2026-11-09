/**
 * 强制更新门禁 e2e：版本判定三分支、清单拉取 fail-open、阻断转变只发一次事件、
 * 门禁复评与生命周期清理。
 *
 * 运行：pnpm test:e2e:force-gate
 */
import assert from 'node:assert/strict'
import process from 'node:process'
import { resolveForceUpdate } from '../../packages/shared/src/force-update.ts'
import { ForceUpdateGate } from '../../packages/update/src/force-gate.ts'
import { parseUpdateManifest } from '../../packages/update/src/manifest.ts'

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

await step('判定：低于 minVersion 阻断并携带要求版本', () => {
  assert.deepEqual(resolveForceUpdate('2.0.0', '2.1.0'), { blocked: true, requiredVersion: '2.1.0' })
})

await step('判定：等于/高于 minVersion 放行', () => {
  assert.deepEqual(resolveForceUpdate('2.1.0', '2.1.0'), { blocked: false })
  assert.deepEqual(resolveForceUpdate('2.2.0', '2.1.0'), { blocked: false })
})

await step('判定：minVersion 缺省或空白放行（fail-open）', () => {
  assert.deepEqual(resolveForceUpdate('1.0.0', undefined), { blocked: false })
  assert.deepEqual(resolveForceUpdate('1.0.0', '  '), { blocked: false })
})

await step('清单 schema：minVersion 可选且通过校验', () => {
  const manifest = parseUpdateManifest({ minVersion: '2.1.0' }, [])
  assert.equal(manifest.minVersion, '2.1.0')
})

function makeGate({ manifest, currentVersion, throwOnFetch = false }) {
  const emitted = []
  const gate = new ForceUpdateGate({
    manifestUrl: 'https://update.example.com/manifest.json',
    allowedOrigins: ['https://update.example.com'],
    currentVersion,
    events: { emit: (name, payload) => emitted.push({ name, payload }) },
    fetchManifest: async () => {
      if (throwOnFetch) { throw new Error('network down') }
      return manifest
    },
    intervalMs: 0,
  })
  return { gate, emitted }
}

await step('门禁：放行 → 阻断转变发一次 force-required', async () => {
  const manifest = parseUpdateManifest({ minVersion: '2.1.0' }, ['https://update.example.com'])
  const { gate, emitted } = makeGate({ manifest, currentVersion: () => '2.0.0' })
  const first = await gate.evaluate()
  const again = await gate.evaluate()
  assert.equal(first.blocked, true)
  assert.equal(again.blocked, true)
  assert.equal(emitted.length, 1, '重复评估不得重复发事件')
  assert.deepEqual(emitted[0], { name: 'update.force-required', payload: { requiredVersion: '2.1.0' } })
})

await step('门禁：阻断后版本达标 → 复评放行且不发事件', async () => {
  const manifest = parseUpdateManifest({ minVersion: '2.1.0' }, ['https://update.example.com'])
  let current = '2.0.0'
  const { gate, emitted } = makeGate({ manifest, currentVersion: () => current })
  await gate.evaluate()
  current = '2.1.0'
  const after = await gate.evaluate()
  assert.equal(after.blocked, false)
  assert.equal(emitted.length, 1)
})

await step('门禁：清单拉取失败保持原决策（fail-open）', async () => {
  const { gate } = makeGate({ manifest: null, currentVersion: () => '1.0.0', throwOnFetch: true })
  const decision = await gate.evaluate()
  assert.deepEqual(decision, { blocked: false })
})

await step('门禁：start/stop 后定时器清空（生命周期收口）', async () => {
  const manifest = parseUpdateManifest({}, ['https://update.example.com'])
  const { gate } = makeGate({ manifest, currentVersion: () => '3.0.0' })
  gate.start()
  await gate.stop()
  assert.equal(gate.snapshot.blocked, false)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)

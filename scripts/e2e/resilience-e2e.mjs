/**
 * 韧性 e2e：择优决策、崩溃退避数学、熔断判定、flavor resilience schema 解析。
 *
 * 运行：pnpm test:e2e:resilience
 */
import assert from 'node:assert/strict'
import process from 'node:process'
import { flavorManifestSchema } from '../../packages/shared/src/manifest.ts'
import { isCircuitOpen, nextCrashDelay, resolveRestartAction } from '../../packages/window/src/resilience-policy.ts'

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

await step('择优：整包已暂存 → install-package（quit 让安装器接管）', () => {
  assert.equal(resolveRestartAction(() => true), 'install-package')
})

await step('择优：无暂存 → relaunch（asar 就位或纯重启同为 relaunch+quit）', () => {
  assert.equal(resolveRestartAction(() => false), 'relaunch')
})

await step('择优：探测抛错按纯重启处理，不阻塞重启', () => {
  assert.equal(resolveRestartAction(() => { throw new Error('state read failed') }), 'relaunch')
})

await step('崩溃退避：1s / 2s / 4s / 8s / 16s / 30s 封顶', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(nextCrashDelay), [1000, 2000, 4000, 8000, 16000, 30000])
  assert.equal(nextCrashDelay(20), 30000)
})

await step('熔断：窗口内第 5 次仍重载，第 6 次熔断', () => {
  assert.equal(isCircuitOpen(5), false)
  assert.equal(isCircuitOpen(6), true)
})

await step('flavor schema：resilience 未声明 → undefined（全关）', () => {
  const flavor = flavorManifestSchema.parse({ id: 'demo', name: 'Demo' })
  assert.equal(flavor.resilience, undefined)
})

await step('flavor schema：声明字段带默认值解析（重启时刻缺省 03:00）', () => {
  const flavor = flavorManifestSchema.parse({
    id: 'demo',
    name: 'Demo',
    resilience: { crashReload: true, exitGuard: true, scheduledRestart: {} },
  })
  assert.equal(flavor.resilience.crashReload, true)
  assert.equal(flavor.resilience.autoLaunch, false)
  assert.deepEqual(flavor.resilience.scheduledRestart, { hour: 3, minute: 0 })
})

await step('flavor schema：非法时刻（25 点）被拒', () => {
  assert.throws(() => flavorManifestSchema.parse({
    id: 'demo',
    name: 'Demo',
    resilience: { scheduledRestart: { hour: 25 } },
  }))
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)

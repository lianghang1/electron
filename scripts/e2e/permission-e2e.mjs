/**
 * 权限模型 e2e：策略表、fail-closed、prompt 持久化、并发去重、审计、应用准入。
 *
 * 运行：pnpm test:e2e:permission
 */
import assert from 'node:assert/strict'
import process from 'node:process'
import { PermissionService } from '../../packages/app-runtime/src/permission-service.ts'

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

const app = (id, devices = [], permissions = []) => ({ id, devices, permissions, type: 'internal' })
const req = (appId, permission) => ({ appId, origin: `app://${appId}`, permission })

process.stdout.write('\n权限模型 e2e\n\n')

await step('未声明规则一律拒绝（fail-closed）', async () => {
  const svc = new PermissionService({ rules: [] })
  assert.equal(await svc.decide(req('x', 'app.open')), false)
})

await step('allow 规则放行，deny 规则拒绝', async () => {
  const svc = new PermissionService({ rules: [
    { app: 'a', permission: 'app.open', verdict: 'allow' },
    { app: 'b', permission: 'app.open', verdict: 'deny' },
  ] })
  assert.equal(await svc.decide(req('a', 'app.open')), true)
  assert.equal(await svc.decide(req('b', 'app.open')), false)
})

await step('prompt 未注入授权浮层时拒绝，不悬空', async () => {
  const svc = new PermissionService({ rules: [{ app: 'a', permission: 'camera', verdict: 'prompt' }] })
  assert.equal(await svc.decide(req('a', 'camera')), false)
})

await step('prompt 经浮层同意后放行并持久化，二次判定不再打扰', async () => {
  const memory = new Map()
  let asked = 0
  const svc = new PermissionService({
    rules: [{ app: 'a', permission: 'camera', verdict: 'prompt' }],
    store: {
      get: async key => memory.get(key),
      set: async (key, value) => { memory.set(key, value) },
    },
    prompt: { ask: async () => { asked++; return true } },
  })
  assert.equal(await svc.decide(req('a', 'camera')), true)
  assert.equal(memory.get('a|camera'), 'allow')
  assert.equal(await svc.decide(req('a', 'camera')), true)
  assert.equal(asked, 1)
})

await step('浮层抛异常时拒绝，异常不穿透成准入成功', async () => {
  const svc = new PermissionService({
    rules: [{ app: 'a', permission: 'camera', verdict: 'prompt' }],
    prompt: { ask: async () => { throw new Error('ui down') } },
  })
  assert.equal(await svc.decide(req('a', 'camera')), false)
})

await step('同一键并发判定只触发一次浮层', async () => {
  let asked = 0
  const svc = new PermissionService({
    rules: [{ app: 'a', permission: 'camera', verdict: 'prompt' }],
    prompt: {
      ask: async () => {
        asked++
        await new Promise(r => setTimeout(r, 10))
        return true
      },
    },
  })
  const results = await Promise.all([svc.decide(req('a', 'camera')), svc.decide(req('a', 'camera')), svc.decide(req('a', 'camera'))])
  assert.deepEqual(results, [true, true, true])
  assert.equal(asked, 1)
})

await step('审计记录每次决策的来源与结论', async () => {
  const log = []
  const svc = new PermissionService({
    rules: [{ app: 'a', permission: 'app.open', verdict: 'allow' }],
    audit: decision => log.push(decision),
  })
  await svc.decide(req('a', 'app.open'))
  await svc.decide(req('z', 'app.open'))
  assert.equal(log.length, 2)
  assert.equal(log[0].source, 'policy')
  assert.equal(log[0].verdict, 'allow')
  assert.equal(log[1].source, 'default')
  assert.equal(log[1].verdict, 'deny')
})

await step('应用准入：声明的权限全部有规则才放行', async () => {
  const svc = new PermissionService({ rules: [
    { app: 'demo', permission: 'app.open', verdict: 'allow' },
    { app: 'demo', permission: 'domain.idcard', verdict: 'allow' },
    { app: 'demo', permission: 'clipboard-read', verdict: 'allow' },
  ] })
  assert.equal(await svc.allowsApp(app('demo', ['idcard'], ['clipboard-read'])), true)
})

await step('应用准入：缺任一声明权限即拒绝', async () => {
  const svc = new PermissionService({ rules: [
    { app: 'demo', permission: 'app.open', verdict: 'allow' },
    { app: 'demo', permission: 'domain.idcard', verdict: 'allow' },
  ] })
  assert.equal(await svc.allowsApp(app('demo', ['idcard'], ['clipboard-read'])), false)
})

await step('第三方应用无显式规则时拒绝打开', async () => {
  const svc = new PermissionService({ rules: [] })
  assert.equal(await svc.allowsApp({ ...app('vendor'), type: 'third-party' }), false)
})

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exitCode = failed > 0 ? 1 : 0

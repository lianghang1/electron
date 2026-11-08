/**
 * 浮层宿主 e2e：纯 Node 假窗口，覆盖策略注册、单例复用、按种类取窗/收场、
 * 参数透传、新增种类零改动、未注册与重复注册拒绝、closeAll。
 *
 * 运行：pnpm test:e2e:overlay
 */
import assert from 'node:assert/strict'
import process from 'node:process'
import { DEFAULT_OVERLAY_POLICIES, OverlayHost } from '../../packages/window/src/overlay-host.ts'

class FakeWindow {
  constructor() {
    this.destroyed = false
    this.focusCount = 0
    this.closedHandlers = []
    this.policy = null
    this.params = null
  }

  isDestroyed() { return this.destroyed }
  focus() { this.focusCount++ }
  once(event, fn) { if (event === 'closed') { this.closedHandlers.push(fn) } }
  close() {
    if (this.destroyed) { return }
    this.destroyed = true
    for (const fn of this.closedHandlers) { fn() }
  }
}

const created = []
const host = new OverlayHost((policy, params) => {
  const win = new FakeWindow()
  win.policy = policy
  win.params = params
  created.push(win)
  return win
})

let passed = 0
let failed = 0
function step(name, fn) {
  try {
    fn()
    passed++
    process.stdout.write(`  PASS  ${name}\n`)
  }
  catch (err) {
    failed++
    process.stdout.write(`  FAIL  ${name}: ${err.message}\n`)
  }
}

process.stdout.write('\n浮层宿主 e2e\n\n')

step('默认策略表覆盖四类，差异全是数据', () => {
  assert.equal(DEFAULT_OVERLAY_POLICIES.length, 4)
  assert.deepEqual(DEFAULT_OVERLAY_POLICIES.map(p => p.kind), ['capture', 'permission', 'app-center', 'settings'])
  for (const policy of DEFAULT_OVERLAY_POLICIES) {
    host.register(policy)
    assert.ok(policy.route.includes(`kind=${policy.kind}`))
    assert.ok(policy.width > 0 && policy.height > 0)
  }
})

step('开窗按策略创建，策略与参数透传给工厂', () => {
  const win = host.open('permission', { requestId: 'r1' })
  assert.equal(win.policy.kind, 'permission')
  assert.equal(win.policy.width, 480)
  assert.deepEqual(win.params, { requestId: 'r1' })
})

step('同类单例复用：再开返回同一实例且不重复创建', () => {
  const first = host.open('capture')
  const before = created.length
  const second = host.open('capture')
  assert.equal(second, first)
  assert.equal(created.length, before)
  assert.equal(first.focusCount, 1)
})

step('不同种类互不干扰，各自持有实例', () => {
  const capture = host.get('capture')
  const appCenter = host.open('app-center')
  assert.notEqual(appCenter, capture)
  assert.equal(host.get('capture'), capture)
  assert.equal(host.get('app-center'), appCenter)
})

step('按种类收场：dismiss 后取窗为空，其他种类不受影响', () => {
  const appCenter = host.get('app-center')
  host.dismiss('capture')
  assert.equal(host.get('capture'), undefined)
  assert.equal(host.get('app-center'), appCenter)
  assert.equal(appCenter.isDestroyed(), false)
})

step('新增浮层只改策略表：注册自定义种类即可开窗，非单例每次新窗', () => {
  host.register({ kind: 'audit', width: 320, height: 240, route: '#/overlay?kind=audit', singleton: false })
  const a = host.open('audit')
  const b = host.open('audit')
  assert.notEqual(a, b)
  assert.equal(a.policy.kind, 'audit')
})

step('未注册种类拒绝开窗', () => {
  assert.throws(() => host.open('unknown'), /not registered/)
})

step('重复注册拒绝，避免策略被静默覆盖', () => {
  assert.throws(() => host.register(DEFAULT_OVERLAY_POLICIES[0]), /already registered/)
})

step('closeAll 清空所有实例，窗口均已关闭', () => {
  const alive = created.filter(w => !w.isDestroyed())
  host.closeAll()
  for (const win of alive) { assert.equal(win.isDestroyed(), true) }
  for (const policy of DEFAULT_OVERLAY_POLICIES) { assert.equal(host.get(policy.kind), undefined) }
  assert.equal(host.get('audit'), undefined)
})

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exitCode = failed > 0 ? 1 : 0

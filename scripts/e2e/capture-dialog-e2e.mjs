/**
 * 拍摄浮层会话 e2e：纯 Node 假窗口与假采集系统，覆盖全局互斥、发起方身份、
 * 浮层窗归属校验、预览帧定向、取消/确认交付、发起 tab 销毁作废。
 *
 * 运行：pnpm test:e2e:capture-dialog
 */
import assert from 'node:assert/strict'
import process from 'node:process'
import { CaptureDialogSessionService } from '../../packages/devices/src/domains/capture/dialog-session.ts'

class FakeWebContents {
  constructor(id) {
    this.id = id
    this.destroyed = false
    this.sent = []
    this.handlers = {}
  }

  isDestroyed() { return this.destroyed }
  send(channel, payload) { this.sent.push({ channel, payload }) }
  once(event, fn) { (this.handlers[event] ??= []).push(fn) }
  destroy() {
    this.destroyed = true
    for (const fn of this.handlers.destroyed ?? []) { fn() }
  }
}

function makeDeps() {
  const captureWc = new FakeWebContents(99)
  const events = { sessions: [], frames: [], dismissed: 0 }
  const capture = {
    findDefaultDevice: async () => 'dev-1',
    startPreview: async (deviceId, onFrame) => { events.frames.push({ deviceId, onFrame }) },
    stopPreview: async () => {},
    captureImage: async () => ({ imagePath: '/files/capture/sdk.jpg' }),
    saveCapturedImage: async () => '/files/capture/uvc.jpg',
  }
  const overlay = {
    pushCaptureSession: session => events.sessions.push(session),
    getCaptureWindow: () => ({ webContents: captureWc }),
    dismissCaptureSession: () => { events.dismissed++ },
  }
  return { captureWc, events, service: new CaptureDialogSessionService({ capture, overlay }) }
}

const tick = () => new Promise(resolve => setImmediate(resolve))

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

process.stdout.write('\n拍摄浮层会话 e2e\n\n')

await step('open 推完整会话描述且全局互斥', async () => {
  const { service, events } = makeDeps()
  const wc = new FakeWebContents(1)
  const p = service.open(
    { title: ' 现场拍照 ', maxCount: 3, deviceId: 'dev-1' },
    { wc, tabId: 't1', appId: 'app-a', appName: '应用A' },
  )
  await tick()
  assert.equal(events.sessions.length, 1)
  const session = events.sessions[0]
  assert.equal(session.appId, 'app-a')
  assert.equal(session.appName, '应用A')
  assert.equal(session.title, '现场拍照')
  assert.equal(session.maxCount, 3)
  assert.equal(session.deviceId, 'dev-1')
  assert.ok(session.sessionId.startsWith('capdlg-'))
  await assert.rejects(
    () => service.open({}, { wc, appId: 'app-a', appName: '应用A' }),
    /DEVICE_BUSY|拍摄浮层已打开/,
  )
  service.cancelByOverlay()
  await p
})

await step('浮层内操作仅拍摄窗可调', async () => {
  const { service } = makeDeps()
  const wc = new FakeWebContents(1)
  const p = service.open({}, { wc, appId: 'a', appName: 'A' })
  await tick()
  const outsider = new FakeWebContents(2)
  await assert.rejects(() => service.startPreview(outsider, 'dev-1'), /PERMISSION_DENIED|capture-dialog-only/)
  await assert.rejects(() => service.capture(outsider), /PERMISSION_DENIED|capture-dialog-only/)
  assert.throws(() => service.confirm(outsider, [{ imagePath: 'x.jpg' }]), /PERMISSION_DENIED|capture-dialog-only/)
  service.cancelByOverlay()
  await p
})

await step('预览帧只推给拍摄浮层窗', async () => {
  const { service, captureWc, events } = makeDeps()
  const wc = new FakeWebContents(1)
  const p = service.open({}, { wc, appId: 'a', appName: 'A' })
  await tick()
  await service.startPreview(captureWc, 'dev-1')
  assert.equal(events.frames.length, 1)
  events.frames[0].onFrame('BASE64')
  assert.deepEqual(captureWc.sent[0], {
    channel: 'capture:frameReceived',
    payload: { deviceId: 'dev-1', base64: 'BASE64' },
  })
  service.cancelByOverlay()
  await p
})

await step('浮层内拍摄走统一采集 API', async () => {
  const { service, captureWc } = makeDeps()
  const wc = new FakeWebContents(1)
  const p = service.open({ deviceId: 'dev-1' }, { wc, appId: 'a', appName: 'A' })
  await tick()
  const result = await service.capture(captureWc)
  assert.equal(result.imagePath, '/files/capture/sdk.jpg')
  service.cancelByOverlay()
  await p
})

await step('浮层取消 → 发起方收到空数组并收场', async () => {
  const { service, events } = makeDeps()
  const wc = new FakeWebContents(1)
  const p = service.open({}, { wc, appId: 'a', appName: 'A' })
  await tick()
  service.cancelByOverlay()
  assert.deepEqual(await p, [])
  assert.equal(events.dismissed, 1)
})

await step('cancelByCaller 身份不符不生效，匹配才作废', async () => {
  const { service } = makeDeps()
  const wc = new FakeWebContents(1)
  const p = service.open({}, { wc, tabId: 't1', appId: 'a', appName: 'A' })
  await tick()
  let settled = false
  void p.then(() => { settled = true })
  service.cancelByCaller({ appId: 'other', tabId: 't1' })
  await tick()
  assert.equal(settled, false)
  service.cancelByCaller({ appId: 'a', tabId: 't1' })
  assert.deepEqual(await p, [])
})

await step('confirm 过滤无效结果、兑现后延迟收场', async () => {
  const { service, captureWc, events } = makeDeps()
  const wc = new FakeWebContents(1)
  const p = service.open({}, { wc, appId: 'a', appName: 'A' })
  await tick()
  assert.throws(() => service.confirm(captureWc, []), /VALIDATION_FAILED|尚未拍摄任何结果/)
  service.confirm(captureWc, [{ imagePath: 'ok.jpg' }, { nope: true }])
  assert.deepEqual(await p, [{ imagePath: 'ok.jpg' }])
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal(events.dismissed, 1)
})

await step('发起 tab 销毁 → 会话作废并拒绝交付', async () => {
  const { service, events } = makeDeps()
  const wc = new FakeWebContents(1)
  const p = service.open({}, { wc, appId: 'a', appName: 'A' })
  await tick()
  wc.destroy()
  await assert.rejects(() => p, /CAPTURE_FAILED|tabClosed/)
  assert.equal(events.dismissed, 1)
})

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exitCode = failed > 0 ? 1 : 0

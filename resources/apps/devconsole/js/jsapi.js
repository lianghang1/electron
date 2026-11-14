import { pushEvent, pushLog } from './store.js'

/**
 * 受控桥封装：全部域调用与事件订阅的唯一出口。
 * 真实环境走 window.jsapi（jsapi preload 注入）；浏览器直开时降级为
 * mock 模式（模拟数据 + 手动事件触发），保证 UI 可脱离壳自测。
 * jsapi:call 的错误从主进程编码进 Error.message（"[CODE] message"），此处归一拆解。
 */

/** 桥是否真实存在（浏览器直开 = false） */
export const bridgeReal = typeof window !== 'undefined' && typeof window.jsapi?.invokeDevice === 'function'

/** 归一错误：{ code, message, raw } */
export function normalizeError(err) {
  const raw = err instanceof Error ? err.message : String(err)
  const match = /^\[([A-Z_]+)\]\s?([\s\S]*)$/.exec(raw)
  return match
    ? { code: match[1], message: match[2], raw }
    : { code: 'UNKNOWN', message: raw, raw }
}

const eventListeners = new Map()

/** 订阅白名单设备事件，返回退订函数（面板 unmount 时必须调用） */
export function onDeviceEvent(name, callback) {
  if (bridgeReal) { return window.jsapi.onDeviceEvent(name, callback) }
  let set = eventListeners.get(name)
  if (!set) { set = new Set(); eventListeners.set(name, set) }
  set.add(callback)
  return () => { set.delete(callback) }
}

/** mock 模式手动触发事件（events 面板按钮） */
export function emitMockEvent(name, payload) {
  for (const callback of eventListeners.get(name) ?? []) { callback(payload) }
}

/** 域调用：统一计时与流水记录；mock 模式返回模拟数据 */
export async function call(method, input = undefined) {
  const started = performance.now()
  if (bridgeReal) {
    try {
      const result = await window.jsapi.invokeDevice(method, input)
      pushLog({ method, input, ok: true, ms: Math.round(performance.now() - started), result })
      return result
    }
    catch (err) {
      const normalized = normalizeError(err)
      pushLog({ method, input, ok: false, ms: Math.round(performance.now() - started), error: normalized })
      throw normalized
    }
  }
  const result = mockCall(method, input)
  pushLog({ method, input, ok: true, ms: Math.round(performance.now() - started), result, mocked: true })
  return result
}

/* ---------------- mock：模拟数据（浏览器自测用；形状与真实契约一致） ---------------- */

const MOCK_DEVICES = {
  print: [{
    id: 'Microsoft Print to PDF', displayName: 'Microsoft Print to PDF', isDefault: true, status: 'unknown',
    capabilities: {
      paperList: [{ name: 'A4', widthMm: 210, heightMm: 297 }, { name: 'A5', widthMm: 148, heightMm: 210 }, { name: '80mm 收据', widthMm: 80 }],
      defaults: { formName: 'A4', color: true },
      duplexSupported: true,
      colorSupported: true,
    },
  }, { id: 'Demo LaserJet', displayName: 'Demo LaserJet', status: 'unknown', capabilities: { paperList: [], defaults: {}, duplexSupported: false, colorSupported: false } }],
  capture: [{ id: 'capture-demo-1', displayName: '高拍仪 Demo', status: 'ready', resolutions: [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }] }],
  idcard: [{ id: 'idcard-demo-1', displayName: '身份证阅读器 Demo', transport: 'dll', status: 'ready' }],
  iccard: [{ id: 'iccard-demo-1', displayName: 'IC 卡读写器 Demo', transport: 'dll', status: 'ready', capabilities: ['iccard-write'] }],
}

const MOCK_INFO = {
  version: '2.0.0-mock',
  flavorId: 'devconsole',
  platform: 'win32',
  appId: 'devconsole',
  declaredDevices: ['print', 'capture', 'idcard', 'iccard', 'scanner'],
  declaredPermissions: ['info'],
  availableDomains: ['print', 'capture', 'idcard', 'iccard', 'scanner'],
  deviceStatuses: [
    { deviceId: 'print', capabilityId: 'print', state: 'ready' },
    { deviceId: 'capture', capabilityId: 'capture', state: 'unavailable', reason: 'device-unplugged', detail: 'mock：设备未接入' },
    { deviceId: 'idcard', capabilityId: 'idcard', state: 'unavailable', reason: 'driver-missing' },
    { deviceId: 'iccard', capabilityId: 'iccard', state: 'unavailable', reason: 'driver-missing' },
    { deviceId: 'scanner', capabilityId: 'scanner', state: 'ready' },
  ],
}

const MOCK_JOBS = [
  { jobId: 'job-mock-001', jobName: '测试页 · Microsoft Print to PDF', state: 'done', createdAt: new Date(Date.now() - 86400000).toISOString(), result: { jobId: 'job-mock-001', channel: 'simulated', printerId: 'Microsoft Print to PDF' } },
  { jobId: 'job-mock-002', jobName: 'PDF/图片链接', state: 'failed', createdAt: new Date(Date.now() - 3600000).toISOString(), error: { code: 'CHANNEL_FAILED', message: 'mock：通道执行失败' } },
]

function mockCall(method, input = {}) {
  const [domain, name] = method.split('.')
  const echo = { ok: true, mocked: true, echo: input }
  switch (method) {
    case 'info.get': return structuredClone(MOCK_INFO)
    case 'print.listDevices': return structuredClone(MOCK_DEVICES.print)
    case 'print.submitPrintJob': return { jobId: `job-mock-${Math.random().toString(36).slice(2, 8)}`, channel: 'simulated', printerId: input.printOptions?.printerId ?? 'Microsoft Print to PDF' }
    case 'print.listPrintJobs': return structuredClone(MOCK_JOBS)
    case 'print.getJobStatus': return { jobId: input.printJobId, state: 'done', createdAt: new Date().toISOString() }
    case 'print.removePrintJob':
    case 'print.reprintJob': return true
    case 'print.clearPrintJobs': return MOCK_JOBS.length
    case 'capture.listDevices':
    case 'capture.listDeviceConfigs': return structuredClone(MOCK_DEVICES.capture)
    case 'capture.getDefaultDevice':
    case 'capture.findDefaultDevice': return MOCK_DEVICES.capture[0]
    case 'capture.setDefaultDevice':
    case 'capture.setConfig': return echo
    case 'capture.captureImage': return { dataUrl: demoImageDataUrl(), format: input.imageFormat ?? 'jpg' }
    case 'capture.saveCapturedImage': return { savedPath: 'C:/mock/capture/demo.png', mocked: true }
    case 'capture.startPreview':
    case 'capture.stopPreview':
    case 'capture.listDeviceCameras': return echo
    case 'idcard.listDevices': return structuredClone(MOCK_DEVICES.idcard)
    case 'idcard.readCard': return mockIdCard()
    case 'idcard.getConfig': return { devices: [{ id: 'idcard-demo-1', displayName: '身份证阅读器 Demo', ws: { url: 'ws://127.0.0.1:9201' } }] }
    case 'idcard.setConfig': return echo
    case 'iccard.listDevices': return structuredClone(MOCK_DEVICES.iccard)
    case 'iccard.readSector': return {
      uid: '04a1b2c3d4',
      cardNumber: '3153601021',
      cardType: '0044',
      blocks: { 4: '31323334353637383930414243444546', 5: '00000000000000000000000000000000', 6: '00000000000000000000000000000000' },
      texts: ['demo'],
    }
    case 'iccard.writeSector':
    case 'iccard.writeTextBlocks': return echo
    case 'iccard.getConfig': return { devices: [{ id: 'iccard-demo-1', displayName: 'IC 卡读写器 Demo', ws: { url: 'ws://127.0.0.1:9301' } }] }
    case 'iccard.setConfig': return echo
    case 'scanner.getConfig': return { enabled: true, activeId: 'scanner-default', devices: [{ id: 'scanner-default', displayName: '扫码枪 Demo', timeout: 100, minLength: 4, endKey: 'Enter', prefixes: [], requirePrefix: false }] }
    case 'scanner.setConfig': return echo
    case 'scanner.simulateScan': return { simulated: true, code: input.scannedCode }
    // 壳设施 mock：形状与 facility-router / kernel 服务一致
    case 'notification.show': return { id: `n-mock-${Math.random().toString(36).slice(2, 8)}` }
    case 'notification.list': return []
    case 'notification.dismiss': return {}
    case 'app.list': return [
      { id: 'devconsole', name: '开发者控制台', version: '1.0.0', kind: 'local' },
      { id: 'dev-doc', name: '外链页签', version: '1.0.0', kind: 'remote' },
    ]
    case 'app.getCurrent': return { appId: 'devconsole', appName: '开发者控制台', instanceId: 'mock-1' }
    case 'app.getManifest': return { id: 'devconsole', name: '开发者控制台', version: '1.0.0', entry: { kind: 'local' }, permissions: ['info', 'notification', 'tabs', 'downloads', 'update'] }
    case 'app.open': return { appId: input.appId, instanceId: `mock-${input.appId}` }
    case 'update.state': return { state: 'idle', currentVersion: '0.0.0-mock' }
    case 'update.check': return { state: 'idle', currentVersion: '0.0.0-mock', mocked: true }
    case 'download.list': return []
    case 'download.open':
    case 'download.reveal':
    case 'download.cancel':
    case 'download.dismiss': return {}
    default: return echo
  }
}

function mockIdCard() {
  return {
    name: '张三', gender: '男', nation: '汉', birthDate: '1990-01-01',
    address: '广东省深圳市南山区科技园 mock 路 1 号',
    idNumber: '440300199001010000',
    issuer: '深圳市公安局南山分局',
    validFrom: '2015-06-01', validTo: '2035-06-01',
    photoDataUrl: demoImageDataUrl(),
  }
}

/** 1x1 蓝色 PNG（抓拍 mock 用最小真实 dataURL，预览区可直接显示） */
function demoImageDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVR4nGP8z8Dwn4GBgYGJgYGB4T8DAwMrw6gMxkC6cAImAHmUBCZ1p/6yAAAAAElFTkSuQmCC'
}

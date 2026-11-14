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
  print: [{ name: 'Microsoft Print to PDF', isDefault: true, status: 'ready' }, { name: 'Demo LaserJet', status: 'idle' }],
  capture: [{ id: 'capture-demo-1', displayName: '高拍仪 Demo', status: 'ready', resolutions: [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }] }],
  idcard: [{ id: 'idcard-demo-1', displayName: '身份证阅读器 Demo', status: 'ready' }],
  iccard: [{ id: 'iccard-demo-1', displayName: 'IC 卡读写器 Demo', status: 'ready' }],
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
  { printJobId: 'job-mock-001', status: 'done', createdAt: Date.now() - 86400000, kind: 'html' },
  { printJobId: 'job-mock-002', status: 'archived', createdAt: Date.now() - 3600000, kind: 'url' },
]

function mockCall(method, input = {}) {
  const [domain, name] = method.split('.')
  const echo = { ok: true, mocked: true, echo: input }
  switch (method) {
    case 'info.get': return structuredClone(MOCK_INFO)
    case 'print.listDevices': return structuredClone(MOCK_DEVICES.print)
    case 'print.submitPrintJob': return { printJobId: `job-mock-${Math.random().toString(36).slice(2, 8)}` }
    case 'print.listPrintJobs': return structuredClone(MOCK_JOBS)
    case 'print.getJobStatus': return { printJobId: input.printJobId, status: 'done' }
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
    case 'iccard.readSector': return { sector: input.sectorNumber ?? 1, blocks: ['A1B2C3D4E5F60718293A4B5C6D7E8F90'.toLowerCase()] }
    case 'iccard.writeSector':
    case 'iccard.writeTextBlocks': return echo
    case 'iccard.getConfig': return { devices: [{ id: 'iccard-demo-1', displayName: 'IC 卡读写器 Demo', ws: { url: 'ws://127.0.0.1:9301' } }] }
    case 'iccard.setConfig': return echo
    case 'scanner.getConfig': return { enabled: true, activeId: 'scanner-default', devices: [{ id: 'scanner-default', displayName: '扫码枪 Demo', timeout: 100, minLength: 4, endKey: 'Enter', prefixes: [], requirePrefix: false }] }
    case 'scanner.setConfig': return echo
    case 'scanner.simulateScan': return { simulated: true, code: input.scannedCode }
    default: return echo
  }
}

function mockIdCard() {
  return {
    name: '张三', sex: '男', nation: '汉', birth: '1990-01-01',
    address: '广东省深圳市南山区科技园 mock 路 1 号',
    idNumber: '440300199001010000',
    issuingAuthority: '深圳市公安局南山分局',
    validFrom: '2015-06-01', validTo: '2035-06-01',
  }
}

/** 1x1 蓝色 PNG（抓拍 mock 用最小真实 dataURL，预览区可直接显示） */
function demoImageDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVR4nGP8z8Dwn4GBgYGJgYGB4T8DAwMrw6gMxkC6cAImAHmUBCZ1p/6yAAAAAElFTkSuQmCC'
}

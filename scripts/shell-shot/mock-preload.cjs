/**
 * 截图 harness 的 mock 桥：把 @shell/bridge 的壳渲染层桥面换成静态假数据，
 * 让渲染层产物（out/renderer）脱离主进程独立可渲染。
 * 形态参数经 additionalArguments 送达（沙箱 preload 的 process.argv polyfill 可读）。
 * 仅 scripts/shell-shot 调试链路使用，不进任何运行时打包。
 */
const { contextBridge } = require('electron')

// 沙箱 preload 模块白名单只有 electron/events/timers/url：读 argv 必须用 polyfill 的全局 process
// eslint-disable-next-line node/prefer-global/process
const args = process.argv
function arg(name, fallback) {
  const hit = args.find(a => a.startsWith(`--shot-${name}=`))
  return hit ? hit.slice(name.length + 8) : fallback
}
const chrome = arg('chrome', 'platform')
const mode = arg('mode', 'windowed')
const openedCount = Number(arg('tabs', '0'))
// main.cjs 把布尔参数序列化成 'true'/'false' 字符串：必须按字面量判，!== '' 会把 'false' 误判为真
const withFail = arg('fail', '') === 'true'

const APPS = [
  { manifest: { id: 'demo-web', name: '演示远程', icon: '', entry: { kind: 'remote' } } },
  { manifest: { id: 'demo-local', name: '本地工具', icon: '', entry: { kind: 'local' } } },
  { manifest: { id: 'demo-third', name: '第三个应用', icon: '', entry: { kind: 'remote' } } },
]
// 应用清单按形态裁剪：solo 直出要求清单恰为一个（--shot-apps=0 可验证无直出撤层）
const catalog = chrome === 'solo' ? APPS.slice(0, Number(arg('apps', '1'))) : APPS

const listeners = new Map()
function onEvent(event, handler) {
  const list = listeners.get(event) ?? []
  list.push(handler)
  listeners.set(event, list)
  return () => {
    const index = list.indexOf(handler)
    if (index >= 0) { list.splice(index, 1) }
  }
}
function emit(event, payload) {
  for (const handler of listeners.get(event) ?? []) { handler(payload) }
}

// 视图加载生命周期模拟：fail 态在 loading-started 后转为 load-failed（失败兜底页可截图）
function emitLifecycle(instanceId, delayMs) {
  setTimeout(() => emit('tabs.state-changed', { instanceId, action: 'loading-started' }), delayMs)
  if (withFail) {
    setTimeout(() => emit('tabs.state-changed', { instanceId, action: 'load-failed' }), delayMs + 500)
  }
  else {
    setTimeout(() => emit('tabs.state-changed', { instanceId, action: 'loading-finished' }), delayMs + 1600)
  }
}

// mount 后延迟派发生命周期事件，模拟「应用已打开」的 tab 会话（open 事件与真实主进程
// 一致伴随视图加载开始：垫场 spinner 先行，loading-finished 随后）
let seq = 0
setTimeout(() => {
  const targets = catalog.slice(0, openedCount)
  for (const app of targets) {
    seq += 1
    const instanceId = `mock-${app.manifest.id}-${seq}`
    emitLifecycle(instanceId, 0)
    emit('app.opened', { appId: app.manifest.id, instanceId })
  }
}, 600)

const shell = {
  // 根域（system）方法直接挂桥面根：首帧打点与内容区矩形上报
  markFirstPaint: () => {},
  reportContentRect: () => {},
  invoke: () => Promise.resolve({}),
  shell: {
    // introGate 与主进程同规则：solo 直出（清单恰一个应用）时启动层等首应用开好再撤
    appearance: () => ({ accent: '#4f46e5', theme: 'light', chrome, ...(chrome === 'solo' && catalog.length === 1 ? { introGate: 'app' } : {}) }),
    info: () => Promise.resolve({
      name: '壳平台',
      flavor: { id: 'shot', name: '截图形态' },
      mode,
      version: '2.0.0-shot',
      forceUpdate: { blocked: false },
    }),
    // 主进程在 ready-to-show 推送一次：harness 里窗口随即展示，立即回调即模拟
    onIntroBegin: (cb) => {
      setTimeout(cb, 0)
      return () => {}
    },
  },
  apps: {
    list: () => Promise.resolve(catalog),
    open: (appId) => {
      const instanceId = `mock-open-${appId}-${++seq}`
      // 模拟视图加载生命周期：垫场 spinner 可见一段时间后完成（或转入失败兜底）
      emitLifecycle(instanceId, 0)
      return Promise.resolve({ instanceId })
    },
    activate: () => Promise.resolve({}),
    close: () => Promise.resolve({}),
  },
  window: {
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
  },
  tabs: {
    reload: (instanceId) => {
      emitLifecycle(instanceId, 0)
    },
  },
  overlay: { open: () => Promise.resolve({}) },
  onEvent,
}

contextBridge.exposeInMainWorld('shell', shell)

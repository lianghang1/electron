import { defineComponent, onUnmounted, ref } from 'vue'
import { call } from '../js/jsapi.js'

/**
 * 自检面板：运行环境 / 运行时授权 / 存储隔离 / 下载门控 / 网络与弹窗 / 越权拒绝——
 * master lab.html 平台自检卡的等位移植。运行时授权项均未在 manifest 声明，
 * 全部走平台授权浮层（允许/拒绝落账）；越权项预期全部拒绝。
 */

const STORAGE_KEY = 'devconsole-selftest-mark'

function stamp() {
  return new Date().toLocaleTimeString()
}

export default defineComponent({
  name: 'SelftestPanel',
  setup() {
    const envInfo = ref(null)
    const permResults = ref([])
    const micLevel = ref(0)
    const micActive = ref(false)
    const storageResult = ref('')
    const dlResults = ref([])
    const netResults = ref([])
    const denyResults = ref([])

    let micStream = null
    let micRaf = 0

    function row(list, ok, name, detail) {
      list.value.unshift({ ok, name, detail, blocked: ok === false, at: stamp() })
      if (list.value.length > 20) { list.value.length = 20 }
    }

    // ── 运行环境：info.get 快照（版本/平台/声明授权/设备状态） ──
    async function loadEnv() {
      envInfo.value = await call('info.get')
    }
    void loadEnv()

    // ── 运行时授权：未声明权限 → 平台授权浮层 ──
    async function testCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        stream.getTracks().forEach(t => t.stop())
        row(permResults, true, 'getUserMedia', '已授权并释放设备')
      }
      catch (err) {
        row(permResults, false, 'getUserMedia', String(err?.message ?? err))
      }
    }
    async function testMic() {
      if (micActive.value) { stopMic(); return }
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(micStream).connect(analyser)
        const buf = new Uint8Array(analyser.frequencyBinCount)
        micActive.value = true
        const tick = () => {
          analyser.getByteTimeDomainData(buf)
          let peak = 0
          for (const v of buf) { peak = Math.max(peak, Math.abs(v - 128)) }
          micLevel.value = Math.min(100, Math.round((peak / 128) * 100))
          micRaf = requestAnimationFrame(tick)
        }
        tick()
        row(permResults, true, 'getUserMedia(audio)', '麦克风电平条已启动')
      }
      catch (err) {
        row(permResults, false, 'getUserMedia(audio)', String(err?.message ?? err))
      }
    }
    function stopMic() {
      cancelAnimationFrame(micRaf)
      micStream?.getTracks().forEach(t => t.stop())
      micStream = null
      micActive.value = false
      micLevel.value = 0
    }
    onUnmounted(stopMic)

    async function testGeolocation() {
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => { row(permResults, true, 'geolocation', '定位授权成功'); resolve() },
          err => { row(permResults, false, 'geolocation', err.message); resolve() },
          { timeout: 8000 },
        )
      })
    }
    async function testFullscreen() {
      try {
        await document.documentElement.requestFullscreen()
        await document.exitFullscreen()
        row(permResults, true, 'requestFullscreen', '全屏授权成功')
      }
      catch (err) {
        row(permResults, false, 'requestFullscreen', String(err?.message ?? err))
      }
    }
    function testPointerLock() {
      const target = document.body
      const promise = target.requestPointerLock()
      Promise.resolve(promise).then(() => {
        document.exitPointerLock()
        row(permResults, true, 'pointerLock', '指针锁定授权成功')
      }).catch((err) => {
        row(permResults, false, 'pointerLock', String(err?.message ?? err))
      })
    }
    async function testDisplayCapture() {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        stream.getTracks().forEach(t => t.stop())
        row(permResults, true, 'display-capture', '屏幕采集授权成功并释放')
      }
      catch (err) {
        row(permResults, false, 'display-capture', String(err?.message ?? err))
      }
    }
    async function testClipboard() {
      try {
        await navigator.clipboard.writeText(`devconsole @ ${stamp()}`)
        row(permResults, true, 'clipboard', '剪贴板写入成功')
      }
      catch (err) {
        row(permResults, false, 'clipboard', String(err?.message ?? err))
      }
    }

    // ── 存储隔离 ──
    function storageWrite() {
      localStorage.setItem(STORAGE_KEY, `mark-${Date.now()}`)
      sessionStorage.setItem(`${STORAGE_KEY}-s`, 'session-only')
      storageResult.value = `已写入 localStorage[${STORAGE_KEY}] 与 sessionStorage 标记 @ ${stamp()}`
    }
    function storageRead() {
      const local = localStorage.getItem(STORAGE_KEY)
      const session = sessionStorage.getItem(`${STORAGE_KEY}-s`)
      storageResult.value = `localStorage: ${local ?? '（空）'}\nsessionStorage: ${session ?? '（空）'}\ncookie: ${document.cookie || '（不可用——app:// 产物源无 cookie）'}`
    }
    function storageClear() {
      localStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(`${STORAGE_KEY}-s`)
      storageResult.value = `已清除 @ ${stamp()}`
    }

    // ── 下载门控：a[download] 触发 will-download → 权限闸门 → download.tasks-changed ──
    function saveBlob(blob, filename) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    }
    function testBlobDownload() {
      const canvas = document.createElement('canvas')
      canvas.width = 240
      canvas.height = 120
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#16324f'
      ctx.fillRect(0, 0, 240, 120)
      ctx.fillStyle = '#fff'
      ctx.font = '14px sans-serif'
      ctx.fillText(`devconsole blob download ${stamp()}`, 20, 64)
      canvas.toBlob((blob) => {
        saveBlob(blob, `devconsole-blob-${Date.now()}.png`)
        row(dlResults, true, 'blob 下载', '已触发 will-download，任务见平台设施面板（download.tasks-changed）')
      })
    }
    async function testRemoteDownload() {
      try {
        const res = await fetch('https://example.com', { mode: 'cors' })
        const blob = await res.blob()
        saveBlob(blob, `devconsole-remote-${Date.now()}.html`)
        row(dlResults, res.ok, '远程下载', `example.com → HTTP ${res.status}，${blob.size}B 已触发 will-download`)
      }
      catch (err) {
        row(dlResults, false, '远程下载', String(err?.message ?? err))
      }
    }

    // ── 网络与弹窗 ──
    async function testFetch() {
      try {
        const res = await fetch('https://example.com', { mode: 'cors' })
        row(netResults, res.ok, 'fetch', `example.com → HTTP ${res.status}`)
      }
      catch (err) {
        row(netResults, false, 'fetch', String(err?.message ?? err))
      }
    }
    async function testFetchCors() {
      try {
        await fetch('https://httpbin.org/get', { mode: 'cors' })
        row(netResults, true, 'fetch cors', 'httpbin.org → 通过')
      }
      catch (err) {
        row(netResults, false, 'fetch cors', String(err?.message ?? err))
      }
    }
    function testPopup() {
      const win = window.open('https://example.com', '_blank')
      row(netResults, !!win, 'window.open', win ? '受管弹窗已创建（平台拦截策略见弹窗行为）' : '弹窗被平台拦截')
    }
    function testAlert() {
      window.alert(`devconsole 原生 alert @ ${stamp()}`)
      row(netResults, true, 'alert', '已展示并返回')
    }
    function testConfirm() {
      const yes = window.confirm('原生 confirm：确定 / 取消都会记录在此')
      row(netResults, true, 'confirm', `用户选择：${yes ? '确定' : '取消'}`)
    }

    // ── 越权自检：预期全部拒绝/不可达（blocked=true 视为安全通过） ──
    /** mock 桥（浏览器直开）没有 window.jsapi，越权链路无从谈起，如实标注跳过 */
    function jsapiMissing() {
      return typeof window.jsapi?.invokeDevice !== 'function'
    }
    async function testUnknownMethod() {
      if (jsapiMissing()) { row(denyResults, true, 'shell.cacheClear', 'mock 桥无 window.jsapi，跳过'); return }
      try {
        await window.jsapi.invokeDevice('shell.cacheClear', {})
        row(denyResults, false, 'shell.cacheClear', '调用竟然成功——安全漏洞')
      }
      catch (err) {
        row(denyResults, true, 'shell.cacheClear', `已拒绝: ${err?.message ?? err}`)
      }
    }
    async function testUndeclaredDomain() {
      if (jsapiMissing()) { row(denyResults, true, 'signature.startSession', 'mock 桥无 window.jsapi，跳过'); return }
      try {
        await window.jsapi.invokeDevice('signature.startSession', {})
        row(denyResults, false, 'signature.startSession', '未声明设备域调用竟然成功——安全漏洞')
      }
      catch (err) {
        row(denyResults, true, 'signature.startSession', `未声明设备域已拒绝: ${err?.message ?? err}`)
      }
    }
    async function testUnknownDomain() {
      if (jsapiMissing()) { row(denyResults, true, 'fingerprint.enroll', 'mock 桥无 window.jsapi，跳过'); return }
      try {
        await window.jsapi.invokeDevice('fingerprint.enroll', {})
        row(denyResults, false, 'fingerprint.enroll', '未知设备域调用竟然成功——安全漏洞')
      }
      catch (err) {
        row(denyResults, true, 'fingerprint.enroll', `未知设备域已拒绝: ${err?.message ?? err}`)
      }
    }
    function testShellBridge() {
      const w = /** @type {any} */ (window)
      const exposed = typeof w.shell !== 'undefined' || typeof w.desktop !== 'undefined'
      row(denyResults, !exposed, '壳专属桥', exposed ? '壳桥泄漏到应用视图——安全漏洞' : '不可达（应用视图仅注入 jsapi）')
    }
    function testBadEventChannel() {
      const w = /** @type {any} */ (window)
      if (typeof w.jsapi?.onDeviceEvent !== 'function') {
        row(denyResults, true, '事件通道', 'jsapi.onDeviceEvent 不存在（mock 桥），跳过')
        return
      }
      let fired = false
      const stop = w.jsapi.onDeviceEvent('shell.internal', () => { fired = true })
      stop?.()
      setTimeout(() => {
        row(denyResults, !fired, '事件通道 shell.internal', fired ? '白名单外通道竟然收到事件——安全漏洞' : '白名单外通道不可订阅')
      }, 300)
    }

    return {
      envInfo, permResults, micLevel, micActive, storageResult, dlResults, netResults, denyResults,
      loadEnv, testCamera, testMic, stopMic, testGeolocation, testFullscreen, testPointerLock, testDisplayCapture, testClipboard,
      storageWrite, storageRead, storageClear,
      testBlobDownload, testRemoteDownload,
      testFetch, testFetchCors, testPopup, testAlert, testConfirm,
      testUnknownMethod, testUndeclaredDomain, testUnknownDomain, testShellBridge, testBadEventChannel,
    }
  },
})

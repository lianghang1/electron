import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue'
import { bridgeReal, call, onDeviceEvent } from '../js/jsapi.js'
import { pushEvent, pushTrace as trace, store } from '../js/store.js'

/**
 * 平台功能实验室：master lab.html 实验区的单页等位（运行环境 / 存储 / 权限 / 下载 /
 * 网络 / 弹窗导航 / 平台 API / 安全边界）。每步实验向底部 CALL TRACE 落一笔语义色流水
 * （绿=符合预期 / 红=不符 / 橙=预期拦截）；桥调用绕过 call() 的自动登记，
 * 避免同一动作在流水里出现成败两套判定。
 */

const LS_KEY = 'lab-count'
const SS_KEY = 'lab-session'
const COOKIE_KEY = 'lab'
const PERM_NAMES = ['clipboard-read', 'clipboard-write', 'notifications', 'media', 'geolocation', 'fullscreen', 'pointerLock', 'display-capture']
const SKIP_MOCK = 'mock 桥无 window.jsapi，跳过（壳内实测需真实桥）'

function nowText() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** jsapi 的错误从主进程编码进 Error.message（"[CODE] message"），展示时剥掉编码前缀 */
function errText(err) {
  const raw = err instanceof Error ? err.message : String(err)
  const stripped = raw.replace(/^\[[A-Z_]+\]\s?/, '')
  return stripped || raw
}

/** permissions.query 的 DOM 类型把 name 收窄成枚举，全量自检需要传任意权限名字符串 */
const queryPermission = /** @type {(descriptor: { name: string }) => Promise<{ state: string }>} */ (
  navigator.permissions.query.bind(navigator.permissions)
)

/** 桥调用绕开 Window 类型收窄与自动流水：实验室按预期语义自行落账 */
const invoke = /** @type {(method: string, input?: unknown) => Promise<any>} */ (
  (method, input) => window.jsapi?.invokeDevice(method, input)
)

export default defineComponent({
  name: 'LabPanel',
  setup() {
    const appId = computed(() => store.info?.appId ?? 'devconsole')
    const loadedAt = nowText()
    const env = ref({ href: '-', ua: '-', locale: '-', screen: '-', viewport: '-', online: '-' })
    const snapshot = ref(null)
    const counters = ref({ ls: '-', ss: '-', cookie: '-' })
    const clipLast = ref('-')
    const notifyLast = ref('-')
    const mediaActive = ref(false)
    const micLevel = ref(0)
    const mediaField = ref('-')
    const geoField = ref('-')
    const tabsPush = ref('-')
    const selfInstance = ref('-')
    const videoEl = ref(/** @type {HTMLVideoElement | null} */ (null))

    // 媒体代际：授权等待期间重复点击 / 手动停止后旧请求作废，拿到的新流立即释放（防摄像头占用泄漏）
    let mediaToken = 0
    /** @type {MediaStream | null} */
    let mediaStream = null
    /** @type {AudioContext | null} */
    let audioCtx = null
    let micRaf = 0

    // mock 桥（浏览器直开）没有 window.jsapi，桥内实验无从谈起，如实标注跳过
    function requireBridge(op) {
      if (bridgeReal) { return true }
      trace(op, 'info', SKIP_MOCK)
      return false
    }

    // ── 运行环境 ──
    function renderViewport() { env.value.viewport = `${window.innerWidth}×${window.innerHeight}` }
    function renderOnline() { env.value.online = navigator.onLine ? '在线' : '离线' }
    function renderEnv() {
      env.value.href = location.href
      env.value.ua = navigator.userAgent
      env.value.locale = `${navigator.language} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
      env.value.screen = `${screen.width}×${screen.height} · DPR ${window.devicePixelRatio}`
      renderViewport()
      renderOnline()
    }
    renderEnv()
    window.addEventListener('resize', renderViewport)
    window.addEventListener('online', renderOnline)
    window.addEventListener('offline', renderOnline)

    async function loadSnapshot() {
      snapshot.value = await call('info.get')
    }
    void loadSnapshot()

    // ── 存储 ──
    function renderCounters() {
      counters.value.ls = `${localStorage.getItem(LS_KEY) ?? 0} 次`
      counters.value.ss = `${sessionStorage.getItem(SS_KEY) ?? 0} 次`
      counters.value.cookie = document.cookie.split('; ').find(c => c.startsWith(`${COOKIE_KEY}=`)) ?? '(无)'
    }
    renderCounters()
    function storageAdd() {
      const n = Number(localStorage.getItem(LS_KEY) ?? '0') + 1
      localStorage.setItem(LS_KEY, String(n))
      renderCounters()
      trace('localStorage +1', 'ok', `写入成功，当前 ${n} 次（重启应用后应保留）`)
    }
    function storageReset() {
      localStorage.setItem(LS_KEY, '0')
      renderCounters()
      trace('localStorage 清零', 'ok', '已清零')
    }
    function sessionAdd() {
      const n = Number(sessionStorage.getItem(SS_KEY) ?? '0') + 1
      sessionStorage.setItem(SS_KEY, String(n))
      renderCounters()
      trace('sessionStorage +1', 'ok', `写入 ${n} 次（Tab 关闭后清空，重启保留）`)
    }
    function cookieAdd() {
      document.cookie = `${COOKIE_KEY}=${Date.now()}; max-age=31536000; path=/`
      renderCounters()
      const saved = document.cookie.split('; ').find(c => c.startsWith(`${COOKIE_KEY}=`))
      // Chromium 仅对 http(s) scheme 开放 cookie（EXCLUDE_NONCOOKIEABLE_SCHEME），app:// 源的写入被
      // 静默丢弃——平台限制而非协议注册问题；内部页状态用 localStorage，https 远程应用不受影响
      trace('cookie 写入', saved ? 'ok' : 'info', saved
        ? '写入成功（持久化一年，重启保留）'
        : '被浏览器拒绝：app:// 非 http(s) scheme，Chromium 不为其存储 cookie（平台限制）')
    }
    function cookieRead() {
      renderCounters()
      trace('cookie 读取', 'info', counters.value.cookie)
    }

    // ── 权限 · 已声明直接放行 ──
    async function clipWrite() {
      const text = `lab-${Date.now()}`
      try {
        await navigator.clipboard.writeText(text)
        clipLast.value = text
        trace('写剪贴板', 'ok', `写入成功: ${text}（复制粘贴基础语义 → 直接放行）`)
      }
      catch (err) {
        clipLast.value = `失败: ${err?.name ?? err}`
        trace('写剪贴板', 'fail', `被拒: ${err?.name ?? err}`)
      }
    }
    async function clipRead() {
      try {
        const text = await navigator.clipboard.readText()
        clipLast.value = text || '(剪贴板为空)'
        trace('读剪贴板', 'ok', `读取成功: ${(text || '(空)').slice(0, 30)}`)
      }
      catch (err) {
        clipLast.value = `失败: ${err?.name ?? err}`
        // 读剪贴板只走 Chromium check 环节（声明制判定），devconsole 未声明 clipboard.read → 拒绝属预期
        trace('读剪贴板', 'block', `被拒: ${err?.name ?? err}（未声明 clipboard.read → 声明制拒绝，flavor 补声明后放行）`)
      }
    }
    async function notifyShow() {
      if (!requireBridge('平台通知')) { return }
      try {
        await invoke('notification.show', { title: '平台功能实验室', body: `平台通知测试 ${nowText()}（manifest 已声明 notification → 放行）` })
        notifyLast.value = '已发送（Shell toast）'
        trace('平台通知', 'ok', '已发送：由 Shell 以应用内 toast 呈现（TTL 由主进程计时），不进 OS 通知中心')
      }
      catch (err) {
        notifyLast.value = `失败: ${errText(err)}`
        trace('平台通知', 'fail', `被拒: ${errText(err)}（manifest 未声明 notification 时平台直接拒绝）`)
      }
    }
    async function sysNotify() {
      try {
        const verdict = await Notification.requestPermission()
        notifyLast.value = verdict
        if (verdict === 'granted') {
          new Notification('平台功能实验室', { body: `系统通知测试 ${nowText()}` })
          trace('系统通知', 'ok', '已发出（OS toast，走系统通知中心），权限 granted')
        }
        else { trace('系统通知', 'fail', `通知权限结果: ${verdict}`) }
      }
      catch (err) {
        notifyLast.value = `失败: ${err?.name ?? err}`
        trace('系统通知', 'fail', `请求失败: ${err?.name ?? err}`)
      }
    }
    async function permQuery() {
      for (const name of PERM_NAMES) {
        try {
          const st = await queryPermission({ name })
          trace(`permissions.${name}`, 'info', st.state)
        }
        catch { trace(`permissions.${name}`, 'info', '查询不支持') }
      }
    }

    // ── 权限 · 运行时授权 ──
    function startMicMeter(stream) {
      audioCtx = new AudioContext()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      audioCtx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!audioCtx) { return }
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (const v of data) { peak = Math.max(peak, Math.abs(v - 128)) }
        micLevel.value = Math.min(100, Math.round((peak / 128) * 100 * 1.5))
        micRaf = requestAnimationFrame(tick)
      }
      tick()
    }
    function stopMedia() {
      mediaToken++
      mediaStream?.getTracks().forEach(t => t.stop())
      mediaStream = null
      cancelAnimationFrame(micRaf)
      if (audioCtx) { void audioCtx.close(); audioCtx = null }
      mediaActive.value = false
      micLevel.value = 0
      if (videoEl.value) { videoEl.value.srcObject = null }
    }
    // 页面卸载兜底：切面板与关窗两条路径都确保摄像头/麦克风硬件立即释放
    window.addEventListener('pagehide', stopMedia)

    async function mediaStart() {
      stopMedia()
      const token = mediaToken
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        // 等待授权期间被停止或重新发起：本次流立即释放，否则摄像头指示灯常亮
        if (token !== mediaToken) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        mediaStream = stream
        mediaActive.value = true
        if (videoEl.value) { videoEl.value.srcObject = mediaStream }
        startMicMeter(mediaStream)
        mediaField.value = `${mediaStream.getVideoTracks().length} 视频 + ${mediaStream.getAudioTracks().length} 音频轨`
        trace('摄像头 + 麦克风', 'ok', '获取成功 → 下方实时画面，对麦克风说话看电平条（未声明 → 授权浮层允许后放行）')
      }
      catch (err) {
        mediaField.value = `失败: ${err?.name ?? err}`
        trace('摄像头 + 麦克风', 'fail', `获取失败: ${err?.name ?? err}（授权拒绝 / 超时 / 无设备）`)
      }
    }
    function mediaStop() {
      stopMedia()
      trace('停止预览', 'info', '媒体预览已停止，硬件已释放')
    }
    function geoLocate() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          geoField.value = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
          trace('地理位置', 'ok', `获取成功（±${Math.round(pos.coords.accuracy)}m）`)
        },
        (err) => {
          geoField.value = `失败: ${err.code}`
          trace('地理位置', 'fail', `${err.message}（授权拒绝 / 超时）`)
        },
        { timeout: 15000 },
      )
    }
    async function fsOnce() {
      try {
        await document.documentElement.requestFullscreen()
        trace('请求全屏', 'ok', '已进入全屏（会话级同步放行）')
        setTimeout(() => {
          void document.exitFullscreen()
          trace('请求全屏', 'info', '1.5s 保持期结束，已自动退出全屏')
        }, 1500)
      }
      catch (err) { trace('请求全屏', 'fail', `失败: ${err?.name ?? err}`) }
    }
    async function lockPointer() {
      try {
        await document.body.requestPointerLock()
        trace('锁定鼠标', 'ok', '鼠标已锁定（会话级同步放行）')
        setTimeout(() => {
          document.exitPointerLock()
          trace('锁定鼠标', 'info', '1.5s 保持期结束，已自动退出鼠标锁定')
        }, 1500)
      }
      catch (err) { trace('锁定鼠标', 'fail', `失败: ${err?.name ?? err}`) }
    }
    async function displayCapture() {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        stream.getTracks().forEach(t => t.stop())
        trace('屏幕捕获', 'ok', '授权浮层允许并取得媒体流，轨道即取即释')
      }
      catch (err) { trace('屏幕捕获', 'fail', `失败: ${err?.name ?? err}（授权拒绝 / 超时）`) }
    }

    // ── 下载 ──
    function downloadBlob() {
      const blob = new Blob([`devconsole download test ${new Date().toISOString()}\n`.repeat(200)], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lab-test-${Date.now()}.txt`
      a.click()
      URL.revokeObjectURL(url)
      trace('blob 下载', 'ok', '已发起 → 任务应出现在右上角 Shell 下载浮窗（未声明 downloads → 首次弹运行时授权卡）')
    }
    async function downloadRemote() {
      // 跨域 <a download> 的 download 属性被 Chromium 忽略（安全限制），直链点击会触发导航、
      // 被平台外链策略转系统浏览器；先 fetch 成 blob 再经同源 blob 链接下载才能进平台下载流程
      // （真实业务同理：下载接口用 fetch / 同源直链）
      try {
        trace('远程下载', 'info', '正在拉取远程文件（约 3MB）…')
        const res = await fetch('https://registry.npmmirror.com/vue/-/vue-3.5.13.tgz')
        if (!res.ok) { throw new Error(`HTTP ${res.status}`) }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'lab-remote-vue.tgz'
        a.click()
        URL.revokeObjectURL(url)
        trace('远程下载', 'ok', `远程文件已取得（${(blob.size / 1024 / 1024).toFixed(1)}MB）→ 进入平台下载流程，右上角浮窗显示进度`)
      }
      catch (err) { trace('远程下载', 'fail', `失败: ${err?.message ?? err}（需外网访问 registry.npmmirror.com）`) }
    }

    // ── 网络请求 ──
    async function fetchOk() {
      trace('fetch httpbin.org', 'info', 'fetch https://httpbin.org/get …')
      try {
        const res = await fetch('https://httpbin.org/get', { signal: AbortSignal.timeout(8000) })
        trace('fetch httpbin.org', 'ok', `成功: HTTP ${res.status}（目标 CORS 开放）`)
      }
      catch (err) { trace('fetch httpbin.org', 'fail', `失败: ${err?.name ?? ''} ${err?.message ?? err}`) }
    }
    async function fetchBlocked() {
      trace('fetch baidu', 'info', 'fetch https://www.baidu.com（未配 CORS）…')
      try {
        await fetch('https://www.baidu.com', { mode: 'cors', signal: AbortSignal.timeout(8000) })
        trace('fetch baidu', 'fail', 'fetch 意外成功——不符预期')
      }
      catch (err) { trace('fetch baidu', 'block', `被拦截: ${err?.name ?? err}（浏览器同源策略，符合预期）`) }
    }

    // ── 弹窗与导航 ──
    function popupInternal() {
      const win = window.open(`${location.pathname}?popup=1`, '_blank', 'width=520,height=420')
      trace('本站弹窗', win ? 'ok' : 'fail', win ? '弹窗已创建（平台受管，同 App Session 登录态）' : '本站弹窗被拦截——不符预期')
    }
    function popupExternal() {
      const win = window.open('https://example.com', '_blank', 'width=520,height=420')
      trace('外部弹窗', win ? 'fail' : 'block', win ? '外部弹窗意外创建（应拒绝！）' : '已拒绝（转系统浏览器），符合预期')
    }
    function navExternal() {
      location.href = 'https://example.com'
      trace('外部导航', 'block', '已发起外部导航 → 平台应拦截并转系统浏览器，本页不应跳走')
      setTimeout(() => trace('外部导航', 'ok', '3 秒后本页仍在 → 导航拦截生效（跳走了则说明拦截失效）'), 3000)
    }
    function dialogAlert() {
      window.alert(`alert 对话框 ${nowText()}`)
      trace('alert', 'ok', '已弹出并关闭')
    }
    function dialogConfirm() {
      const yes = window.confirm('confirm 对话框：确定吗？')
      trace('confirm', 'ok', `返回 ${yes}（prompt 为 Electron 平台限制不可用）`)
    }

    // ── 平台 API ──
    // Tab 会话状态由 Shell 全量推送（增删 / 激活 / 重载），页面只渲染最近一条
    const stopTabsPush = onDeviceEvent('tabs.state-changed', (payload) => {
      pushEvent('tabs.state-changed', payload)
      const p = /** @type {{ instanceId?: string, action?: string }} */ (payload)
      tabsPush.value = `${p.instanceId ?? '—'} · ${p.action ?? '—'} @ ${nowText()}`
    })

    async function appList() {
      if (!requireBridge('app.list')) { return }
      try {
        const apps = await invoke('app.list')
        trace('app.list', 'ok', `${apps.length} 个 → ${apps.map(a => `${a.id}(${a.kind})`).join('、')}`)
      }
      catch (err) { trace('app.list', 'fail', `失败: ${errText(err)}`) }
    }
    async function appCurrent() {
      if (!requireBridge('app.getCurrent')) { return }
      try {
        const ctx = await invoke('app.getCurrent')
        selfInstance.value = `${ctx.appId} @ ${ctx.instanceId}`
        trace('app.getCurrent', 'ok', `appId=${ctx.appId} · 实例=${ctx.instanceId}`)
      }
      catch (err) { trace('app.getCurrent', 'fail', `失败: ${errText(err)}`) }
    }
    async function appManifest() {
      if (!requireBridge('app.getManifest')) { return }
      try {
        const m = await invoke('app.getManifest')
        trace('app.getManifest', 'ok', `${m.name} v${m.version} · entry=${m.entry?.kind} · 声明权限 ${(m.permissions ?? []).length} 项 · 声明设备 ${(m.devices ?? []).length} 项`)
      }
      catch (err) { trace('app.getManifest', 'fail', `失败: ${errText(err)}`) }
    }
    async function appOpen() {
      if (!requireBridge('app.open')) { return }
      try {
        const r = await invoke('app.open', { appId: 'dev-doc' })
        trace('app.open', 'ok', `已打开 ${r.appId}（实例 ${r.instanceId}）——多 tab 工作台新建页签，重复打开聚焦活跃实例`)
      }
      catch (err) { trace('app.open', 'fail', `失败: ${errText(err)}`) }
    }
    async function updateState() {
      if (!requireBridge('update.state')) { return }
      try {
        const s = await invoke('update.state')
        trace('update.state', 'ok', JSON.stringify(s))
      }
      catch (err) { trace('update.state', 'fail', `失败: ${errText(err)}`) }
    }
    async function updateCheck() {
      if (!requireBridge('update.check')) { return }
      try {
        const s = await invoke('update.check')
        trace('update.check', 'ok', `已触发 ${JSON.stringify(s)}（flavor 配置 manifestUrl 时生效）`)
      }
      catch (err) {
        // flavor 未配置 manifestUrl 时平台不装配更新通道，调用被拒属预期（契约保留，能力按配置启用）
        trace('update.check', 'block', `通道未启用（flavor 未配 manifestUrl / 未声明 update，属预期）— ${errText(err)}`)
      }
    }

    // ── 安全边界（App 无权动作，应全部被拒） ──
    async function denyExpect(op, method, input) {
      if (!requireBridge(op)) { return }
      try {
        await invoke(method, input)
        trace(op, 'fail', `${method} 意外成功——越权漏洞！`)
      }
      catch (err) { trace(op, 'block', `${method} 被拒（${errText(err)}）`) }
    }
    const denyTabsSuppress = () => denyExpect('tabs.setViewSuppressed', 'tabs.setViewSuppressed', true)
    const denyCache = () => denyExpect('cache.clear', 'cache.clear', { appId: 'oa' })
    const denyCacheSite = () => denyExpect('cache.clearSite', 'cache.clearSite', { appId: 'oa' })
    const denyPermReset = () => denyExpect('permission.reset', 'permission.reset', { appId: 'fsy' })
    const denyRespond = () => denyExpect('permission.respond', 'permission.respond', { requestId: '00000000-0000-4000-8000-000000000000', granted: true })
    const denyUndeclaredDomain = () => denyExpect('signature.startSession', 'signature.startSession', {})
    const denyUnknownDomain = () => denyExpect('fingerprint.enroll', 'fingerprint.enroll', {})

    /** 桥面结构探测：Shell 桥与 $invoke / overlay 等通道按契约不应存在于应用桥 */
    function denyOverlayRemoved() {
      if (!requireBridge('overlay 通道')) { return }
      const bridge = /** @type {any} */ (window.jsapi)
      const w = /** @type {any} */ (window)
      const gone = typeof bridge.overlay === 'undefined'
        && typeof bridge.showMenu === 'undefined'
        && typeof bridge.action === 'undefined'
        && typeof w.shell === 'undefined'
        && typeof w.desktop === 'undefined'
      trace('overlay 通道', gone ? 'block' : 'fail', gone
        ? '应用桥仅 exposeInMainWorld(jsapi)，Shell 桥 / overlay.showMenu / action 均不可达'
        : '壳专属通道仍暴露于应用桥——越权漏洞！')
    }
    function denyGenericInvoke() {
      if (!requireBridge('$invoke 通道')) { return }
      const bridge = /** @type {any} */ (window.jsapi)
      const gone = typeof bridge.$invoke === 'undefined'
      trace('$invoke 通道', gone ? 'block' : 'fail', gone
        ? '受控桥无通用 $invoke（仅 invokeDevice 定名通道）'
        : '通用 $invoke 仍暴露——白名单失效！')
    }
    function denyBadEventChannel() {
      if (!requireBridge('事件通道 shell.internal')) { return }
      let fired = false
      const stop = window.jsapi?.onDeviceEvent('shell.internal', () => { fired = true })
      stop?.()
      setTimeout(() => {
        trace('事件通道 shell.internal', fired ? 'fail' : 'block', fired
          ? '白名单外通道竟然收到事件——安全漏洞'
          : '白名单外通道不可订阅')
      }, 300)
    }

    onMounted(() => {
      trace('实验室', 'info', '页面加载完成。绿=符合预期，红=不符，橙=预期被拦截')
      trace('实验室', 'info', '运行时授权类操作首次点击会弹出授权浮层，决策持久化后不再询问')
    })

    onUnmounted(() => {
      window.removeEventListener('resize', renderViewport)
      window.removeEventListener('online', renderOnline)
      window.removeEventListener('offline', renderOnline)
      window.removeEventListener('pagehide', stopMedia)
      stopMedia()
      stopTabsPush()
    })

    // 受管弹窗形态标记：window.open 本站弹窗以 ?popup=1 重进本页
    if (location.search.includes('popup=1')) { document.title = '开发者控制台 · 受管弹窗' }

    return {
      appId, loadedAt, env, snapshot, counters, clipLast, notifyLast,
      mediaActive, micLevel, mediaField, geoField, tabsPush, selfInstance, videoEl,
      loadSnapshot,
      storageAdd, storageReset, sessionAdd, cookieAdd, cookieRead,
      clipWrite, clipRead, notifyShow, sysNotify, permQuery,
      mediaStart, mediaStop, geoLocate, fsOnce, lockPointer, displayCapture,
      downloadBlob, downloadRemote,
      fetchOk, fetchBlocked,
      popupInternal, popupExternal, navExternal, dialogAlert, dialogConfirm,
      appList, appCurrent, appManifest, appOpen, updateState, updateCheck,
      denyTabsSuppress, denyOverlayRemoved, denyCache, denyCacheSite, denyPermReset, denyRespond,
      denyGenericInvoke, denyUndeclaredDomain, denyUnknownDomain, denyBadEventChannel,
    }
  },
})

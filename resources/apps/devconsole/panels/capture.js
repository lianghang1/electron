import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue'
import { bridgeReal, call, emitMockEvent, onDeviceEvent } from '../js/jsapi.js'
import { toast } from '../js/toast.js'
import { fmtTime, registerRefresher } from '../js/store.js'

/**
 * 拍摄：合一设备下拉（采集设备 + 本机摄像头）+ capKind 路线分发（uvc getUserMedia 抽帧 /
 * camsdk ws 实时预览 / other 设备端抓拍）+ 拍摄记录回放与一键打印 + 原生拍摄浮层。
 * 分辨率联动：camsdk 用设备枚举档位（localStorage 按设备记忆），UVC 常用档走 applyConstraints。
 * 离开面板回收全部流。
 */

const UVC_PREFIX = 'uvc:'
const UVC_RESOLUTIONS = ['1920x1080', '1280x720', '960x540', '640x480']
const UVC_RES_KEY = 'dc-cap-res:uvc'
const TRANSPORT_LABEL = { ws: '本地服务', dll: 'SDK 直连', service: '本地服务', wia: 'WIA', uvc: 'UVC' }

export default defineComponent({
  name: 'CapturePanel',
  setup() {
    const devices = ref(null)
    const configs = ref([])
    const cams = ref([])
    const deviceSel = ref('')

    const records = ref([])
    const currentRec = ref(null)
    const replaying = ref(false)
    const replayUrl = ref('')
    const rot = ref(0)
    const mirror = ref(false)

    const uvcLive = ref(false)
    const uvcVideo = ref(null)
    let uvcStream = null
    const wsLive = ref(false)
    const frameUrl = ref('')
    const frameCount = ref(0)

    const resSel = ref('')
    const resOptions = ref([{ value: '', label: '默认' }])

    const dlgTitle = ref('拍摄浮层')
    const dlgMax = ref(3)
    const dlgBusy = ref(false)

    let unsubscribe = null
    const cameraCache = new Map()

    onMounted(() => {
      ensureFrameListener()
      void loadConfigs().then(loadDevices)
    })
    onUnmounted(teardown)

    const mediaTransform = computed(() => `rotate(${rot.value % 360}deg) ${mirror.value ? 'scaleX(-1)' : ''}`)

    /** 90°/270° 旋转时画布宽高对调 */
    const rotSwapped = computed(() => {
      const r = ((rot.value % 360) + 360) % 360
      return r === 90 || r === 270
    })

    /** 所选采集设备对应的 ws 配置（UVC 设备或档案缺失返回 null） */
    const selectedConfig = computed(() => {
      const id = deviceSel.value
      if (!id || id.startsWith(UVC_PREFIX)) { return null }
      const idx = id.indexOf(':')
      if (idx < 0) { return null }
      const key = id.slice(idx + 1)
      return (configs.value ?? []).find(c => c.id === key && c.ws) ?? null
    })

    /** 当前所选设备类型：uvc（本机摄像头）/ camsdk（CamSDK WS 高拍仪）/ other（SDK 直连或未加载档案） */
    const capKind = computed(() => {
      if (deviceSel.value.startsWith(UVC_PREFIX)) { return 'uvc' }
      return selectedConfig.value?.ws?.protocol === 'camsdk' ? 'camsdk' : 'other'
    })

    const live = computed(() => uvcLive.value || wsLive.value)
    const canOpen = computed(() => capKind.value !== 'other' && !live.value)
    const openLabel = computed(() => capKind.value === 'camsdk' ? '开启预览' : '开启摄像头')
    const canClose = computed(() => !!live.value)
    const shotLabel = computed(() => capKind.value === 'uvc' && uvcLive.value ? '拍摄（抽帧）' : '拍摄')
    const resDisabled = computed(() => capKind.value === 'other')

    const optionValues = computed(() => [
      ...(devices.value ?? []).map(d => d.id),
      ...cams.value.map((c, i) => UVC_PREFIX + (c.deviceId || i)),
    ])

    /** 所选选项的展示文本（UVC 摄像头 deviceId 跨窗口随机化，浮层二次匹配要靠它） */
    const selectedLabel = computed(() => {
      if (deviceSel.value.startsWith(UVC_PREFIX)) {
        const key = deviceSel.value.slice(UVC_PREFIX.length)
        const idx = cams.value.findIndex(c => (c.deviceId || '') === key)
        return cams.value[idx]?.label || `摄像头 ${idx + 1}`
      }
      const d = (devices.value ?? []).find(x => x.id === deviceSel.value)
      return d ? `${d.displayName}（${TRANSPORT_LABEL[d.transport] ?? d.transport}）` : undefined
    })

    // ── 枚举：设备 + 摄像头，保留仍有效的选中项 ──

    async function loadDevices() {
      try {
        devices.value = /** @type {any[]} */ (await call('capture.listDevices'))
      }
      catch { devices.value = [] }
      try {
        cams.value = (await navigator.mediaDevices?.enumerateDevices())?.filter(d => d.kind === 'videoinput') ?? []
      }
      catch { cams.value = [] }
      syncSelection()
    }

    async function loadConfigs() {
      try {
        configs.value = /** @type {any[]} */ (await call('capture.listDeviceConfigs'))
      }
      catch { configs.value = [] }
    }

    function syncSelection() {
      const values = optionValues.value
      if (!values.includes(deviceSel.value)) {
        deviceSel.value = (devices.value ?? []).length ? devices.value[0].id : (cams.value.length ? UVC_PREFIX + (cams.value[0].deviceId || 0) : '')
      }
      void syncResolutionOptions()
    }

    const unregisterDevices = registerRefresher(loadDevices)
    const unregisterConfigs = registerRefresher(loadConfigs)

    // ── 分辨率联动 ──

    /** 枚举设备摄像头（失败返回 null：服务离线等），按设备缓存 */
    async function fetchCamerasSafe(deviceId) {
      if (cameraCache.has(deviceId)) { return cameraCache.get(deviceId) }
      try {
        const cams2 = /** @type {any[]} */ (await call('capture.listDeviceCameras', { deviceId }))
        cameraCache.set(deviceId, cams2)
        return cams2
      }
      catch {
        cameraCache.set(deviceId, null)
        return null
      }
    }

    async function syncResolutionOptions() {
      const kind = capKind.value
      if (kind === 'other') {
        resOptions.value = [{ value: '', label: '由设备端输出' }]
        resSel.value = ''
        return
      }
      if (kind === 'uvc') {
        resOptions.value = [{ value: '', label: '默认' }, ...UVC_RESOLUTIONS.map(r => ({ value: r, label: r }))]
        resSel.value = localStorage.getItem(UVC_RES_KEY) ?? ''
        return
      }
      // camsdk：所选摄像头（配置 camId）的枚举分辨率；服务离线时退回默认档
      const config = selectedConfig.value
      const camList = config ? await fetchCamerasSafe(deviceSel.value) : null
      const cam = camList?.find(c => c.id === (config.ws.camId ?? 0)) ?? camList?.[0]
      if (!cam?.resolutions?.length) {
        resOptions.value = [{ value: '', label: '默认' }]
        resSel.value = ''
        return
      }
      resOptions.value = [{ value: '', label: '默认' }, ...cam.resolutions.map((r, i) => ({ value: String(i), label: String(r) }))]
      const saved = localStorage.getItem(`dc-cap-res:${config.id}`)
      resSel.value = saved !== null && Number(saved) < cam.resolutions.length ? saved : ''
    }

    /** 分辨率下拉当前值 → camsdk 分辨率序号（空 = 默认，不传） */
    function currentResolutionNum() {
      return resSel.value === '' ? undefined : Number(resSel.value)
    }

    async function onResChange() {
      const config = selectedConfig.value
      const key = capKind.value === 'uvc' ? UVC_RES_KEY : config ? `dc-cap-res:${config.id}` : null
      if (key) { localStorage.setItem(key, resSel.value) }
      if (capKind.value === 'uvc') {
        const track = uvcStream?.getVideoTracks()[0]
        if (!track) { return }
        const [w, h] = resSel.value ? resSel.value.split('x').map(Number) : []
        try {
          await track.applyConstraints({ width: w ? { ideal: w } : undefined, height: h ? { ideal: h } : undefined })
          toast(w ? `分辨率已切换为 ${w}×${h}` : '分辨率已恢复默认')
        }
        catch (e) { toast(`分辨率切换失败：${e.message}`, false) }
        return
      }
      // camsdk：预览开启中则用新分辨率重启会话
      if (wsLive.value) {
        await stopWsPreview()
        await startWsPreview()
      }
    }

    // ── 设备切换 / 开关实时画面 ──

    async function onDeviceChange() {
      stopUvcStream()
      await stopWsPreview()
      replaying.value = false
      frameUrl.value = ''
      currentRec.value = null
      await syncResolutionOptions()
    }

    function stopUvcStream() {
      uvcStream?.getTracks().forEach(t => t.stop())
      uvcStream = null
      uvcLive.value = false
    }

    async function stopWsPreview() {
      if (!wsLive.value) { return }
      wsLive.value = false
      const deviceId = deviceSel.value
      if (deviceId) {
        try { await call('capture.stopPreview', { deviceId }) }
        catch { /* 会话可能已掉线，忽略 */ }
      }
    }

    async function openLive() {
      if (capKind.value === 'camsdk') { await startWsPreview() } else { await openCamera() }
    }

    async function closeLive() {
      stopUvcStream()
      await stopWsPreview()
      replaying.value = false
    }

    async function openCamera() {
      const deviceId = deviceSel.value.slice(UVC_PREFIX.length)
      if (!deviceId) { toast('请先选择一个本机摄像头', false); return }
      stopUvcStream()
      try {
        const [w, h] = resSel.value && resSel.value.includes('x') ? resSel.value.split('x').map(Number) : []
        uvcStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: w ? { ideal: w } : { ideal: 1920 }, height: h ? { ideal: h } : { ideal: 1080 } },
          audio: false,
        })
        const video = uvcVideo.value
        video.srcObject = uvcStream
        await video.play()
        uvcLive.value = true
        replaying.value = false
        void loadDevices() // 授权后标签才填充，重新枚举
      }
      catch (e) {
        toast(`摄像头打开失败：${e.message ?? e}`, false)
      }
    }

    async function startWsPreview() {
      const deviceId = deviceSel.value
      if (!deviceId) { toast('请先选择采集设备', false); return }
      try {
        const resNum = currentResolutionNum()
        await call('capture.startPreview', resNum === undefined ? { deviceId } : { deviceId, resolutionNum: resNum })
        wsLive.value = true
        replaying.value = false
        toast('预览已开启，可随时拍摄')
      }
      catch (e) { toast(`预览失败：${e.message ?? '未知错误'}`, false) }
    }

    function ensureFrameListener() {
      if (unsubscribe) { return }
      unsubscribe = onDeviceEvent('capture.frame', (payload) => {
        frameCount.value++
        if (!wsLive.value || payload?.deviceId !== deviceSel.value) { return }
        // 新帧到达即回到实时画面（浏览拍摄记录时来新帧 = 自动回直播）
        replaying.value = false
        if (payload.frame) { frameUrl.value = payload.frame }
      })
    }

    function rotate() { rot.value = (rot.value + 90) % 360 }
    function toggleMirror() { mirror.value = !mirror.value }

    // ── 拍摄：UVC 抽帧 / 设备端抓拍 ──

    function shot() {
      if (capKind.value === 'uvc' && uvcStream) { void captureUvcFrame() } else { void captureByDevice() }
    }

    /** canvas 抽帧：旋转/镜像感知，JPEG 0.92；落盘经 capture.saveCapturedImage 供打印 */
    async function captureUvcFrame() {
      const video = uvcVideo.value
      if (!uvcStream || !video?.videoWidth) { toast('摄像头未就绪', false); return }
      const vw = video.videoWidth
      const vh = video.videoHeight
      const canvas = document.createElement('canvas')
      canvas.width = rotSwapped.value ? vh : vw
      canvas.height = rotSwapped.value ? vw : vh
      const ctx = canvas.getContext('2d')
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rot.value * Math.PI) / 180)
      ctx.scale(mirror.value ? -1 : 1, 1)
      ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      try {
        const imagePath = /** @type {string} */ (await call('capture.saveCapturedImage', { imageDataUrl: dataUrl, imageExtension: 'jpg' }))
        pushRecord({ imagePath, thumbDataUrl: dataUrl }, '本机摄像头')
        toast('拍摄完成')
      }
      catch (e) {
        // 落盘失败仍保留缩略记录（可看不可打）
        pushRecord({ imagePath: null, thumbDataUrl: dataUrl }, '本机摄像头')
        toast(`保存失败：${e.message ?? e}（缩略图已留存）`, false)
      }
    }

    async function captureByDevice() {
      const deviceId = deviceSel.value
      if (!deviceId) { toast('请先选择采集设备', false); return }
      try {
        const resIdx = capKind.value === 'camsdk' ? currentResolutionNum() : undefined
        const r = /** @type {{ imagePath: string, thumbDataUrl: string, meta?: any }} */ (await call('capture.captureImage', resIdx === undefined ? { deviceId } : { deviceId, resolutionIndex: resIdx }))
        pushRecord(r, (devices.value ?? []).find(d => d.id === deviceId)?.displayName ?? '设备')
        toast('拍摄完成')
      }
      catch (e) { toast(`拍摄失败：${e.message ?? '未知错误'}`, false) }
    }

    // ── 拍摄记录：缩略横排 + 点击回放 + 打印此图 ──

    function pushRecord(result, source) {
      currentRec.value = result
      records.value.unshift({ result, time: fmtTime(Date.now()), source })
      if (records.value.length > 12) { records.value.pop() }
      replaying.value = false
    }

    function recordTitle(r) {
      const m = r.result.meta ?? {}
      const size = m.width && m.height ? `，成片 ${m.width}×${m.height}` : ''
      const path = r.result.imagePath ? `\n已保存：${r.result.imagePath}` : ''
      return `${r.source} ${r.time}${size}${path}`
    }

    /** 点击缩略图回放拍摄记录；来新帧时自动回直播 */
    function pickRecord(r) {
      currentRec.value = r.result
      replaying.value = true
      replayUrl.value = r.result.thumbDataUrl ?? ''
    }

    function clearRecords() {
      records.value = []
      currentRec.value = null
      replaying.value = false
      toast('已清空拍摄记录')
    }

    /** 打印此图：抓拍文件路径直通 print 域 file 负载 */
    async function printRecord() {
      if (!currentRec.value?.imagePath) { return }
      try {
        const r = /** @type {{ jobId: string }} */ (await call('print.submitPrintJob', {
          printContent: { kind: 'file', path: currentRec.value.imagePath },
          printOptions: { paper: 'a4', copies: 1, silent: true, jobName: '高拍仪图片' },
        }))
        toast(`已提交打印：${r.jobId}`)
      }
      catch (e) { toast(`打印失败：${e.message ?? '未知错误'}`, false) }
    }

    // ── 原生拍摄浮层：自动携带当前所选设备，结果整批进拍摄记录 ──

    async function openDialog() {
      dlgBusy.value = true
      try {
        const results = /** @type {any[]} */ (await call('capture.openCaptureDialog', {
          title: dlgTitle.value || undefined,
          maxCount: dlgMax.value > 0 ? dlgMax.value : undefined,
          deviceId: deviceSel.value || undefined,
          deviceLabel: deviceSel.value ? selectedLabel.value : undefined,
        }))
        for (const r of Array.isArray(results) ? results : []) { pushRecord(r, '拍摄浮层') }
        if (Array.isArray(results) && results.length) { toast(`拍摄完成（${results.length} 张）`) }
      }
      catch (e) { toast(`拍摄浮层失败：${e.message ?? '未知错误'}`, false) }
      finally { dlgBusy.value = false }
    }

    function openConfig() {
      void call('overlay.openConfig', { category: 'capture' })
    }

    /** mock 桥下手动产生一帧，验证帧渲染链路 */
    function mockFrame() {
      emitMockEvent('capture.frame', { deviceId: deviceSel.value, frame: demoFrame() })
    }
    function demoFrame() {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 200
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#16324f'
      ctx.fillRect(0, 0, 320, 200)
      ctx.fillStyle = '#3f77b4'
      ctx.font = '16px sans-serif'
      ctx.fillText(`capture.frame mock #${frameCount.value + 1}`, 60, 104)
      return canvas.toDataURL('image/png')
    }

    /** 离开面板 = 停 UVC 流 + 停预览 + 退订帧 */
    async function teardown() {
      unregisterDevices()
      unregisterConfigs()
      unsubscribe?.()
      unsubscribe = null
      stopUvcStream()
      await stopWsPreview().catch(() => {})
    }

    return {
      UVC_PREFIX, TRANSPORT_LABEL, bridgeReal,
      devices, configs, cams, deviceSel,
      records, currentRec, replaying, replayUrl, rot, mirror, mediaTransform,
      uvcLive, uvcVideo, wsLive, frameUrl, frameCount,
      resSel, resOptions, resDisabled,
      capKind, live, canOpen, openLabel, canClose, shotLabel, selectedLabel,
      dlgTitle, dlgMax, dlgBusy,
      loadDevices, loadConfigs, onDeviceChange, onResChange, openLive, closeLive,
      shot, rotate, toggleMirror, pickRecord, clearRecords, printRecord,
      openDialog, openConfig, mockFrame, recordTitle,
    }
  },
})

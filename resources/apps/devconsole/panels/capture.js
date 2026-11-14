import { computed, defineAsyncComponent, defineComponent, onUnmounted, ref } from 'vue'
import { CATALOG } from '../js/catalog.js'
import { bridgeReal, call, emitMockEvent, onDeviceEvent } from '../js/jsapi.js'

/**
 * 拍摄：采集设备（capture 域 ws 预览/抓拍）+ 本机摄像头 UVC 路线（渲染层 getUserMedia）+
 * 原生拍摄浮层。UVC：enumerateDevices 枚举 → getUserMedia 预览 → canvas 抽帧（旋转/镜像感知）→
 * saveCapturedImage 落盘 → 可一键打印。离开面板回收全部流。
 */

const UVC_PREFIX = 'uvc:'
const UVC_RESOLUTIONS = ['1920x1080', '1280x720', '960x540', '640x480']
const UVC_RES_KEY = 'dc-cap-res:uvc'

export default defineComponent({
  name: 'CapturePanel',
  components: { InvokeForm: defineAsyncComponent(() => import('../js/components/invoke-form.js').then(m => m.default)), DeviceList: defineAsyncComponent(() => import('../js/components/device-list.js').then(m => m.default)) },
  setup() {
    const devices = ref(null)
    const previewing = ref(false)
    const previewDeviceId = ref('')
    const frameUrl = ref('')
    const frameCount = ref(0)
    const shot = ref(null)
    const dlgTitle = ref('拍摄浮层')
    const dlgMax = ref(3)
    const dlgDeviceId = ref('')
    const dlgBusy = ref(false)
    const dlgDone = ref(false)
    const dlgResults = ref([])

    const captureImageDef = CATALOG.capture.methods.captureImage

    // ── UVC（本机摄像头）：渲染层直连，权限经壳运行时授权浮窗 ──
    const cams = ref([])
    const uvcSel = ref('')
    const uvcLive = ref(false)
    const uvcMsg = ref('')
    const rot = ref(0)
    const mirror = ref(false)
    const uvcRes = ref(localStorage.getItem(UVC_RES_KEY) ?? '')
    const records = ref([])
    const currentRec = ref(null)
    const uvcVideo = ref(null)
    let uvcStream = null

    const mediaTransform = computed(() => `rotate(${rot.value % 360}deg) ${mirror.value ? 'scaleX(-1)' : ''}`)

    /** 90°/270° 旋转时画布宽高对调 */
    const rotSwapped = computed(() => {
      const r = ((rot.value % 360) + 360) % 360
      return r === 90 || r === 270
    })

    let unsubscribe = null

    onUnmounted(teardown)

    async function loadDevices() {
      devices.value = await call('capture.listDevices')
      if (!previewDeviceId.value && devices.value?.length) { previewDeviceId.value = devices.value[0].id }
      // 授权后 label 才会由系统填充，打开摄像头成功后也重枚举一次
      try {
        cams.value = (await navigator.mediaDevices?.enumerateDevices())?.filter(d => d.kind === 'videoinput') ?? []
      }
      catch { cams.value = [] }
    }

    async function openCamera() {
      const deviceId = uvcSel.value.slice(UVC_PREFIX.length)
      if (!deviceId) { uvcMsg.value = '请先选择一个本机摄像头'; return }
      uvcMsg.value = ''
      stopUvcStream()
      try {
        const [w, h] = uvcRes.value ? uvcRes.value.split('x').map(Number) : []
        uvcStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: w ? { ideal: w } : { ideal: 1920 }, height: h ? { ideal: h } : { ideal: 1080 } },
          audio: false,
        })
        const video = uvcVideo.value
        video.srcObject = uvcStream
        await video.play()
        uvcLive.value = true
        currentRec.value = null
        void loadDevices() // 授权后标签才填充，重新枚举
      }
      catch (e) {
        uvcMsg.value = `摄像头打开失败：${e.message ?? e}`
      }
    }

    function stopUvcStream() {
      uvcStream?.getTracks().forEach(t => t.stop())
      uvcStream = null
      uvcLive.value = false
    }

    function closeCamera() {
      stopUvcStream()
      uvcMsg.value = ''
    }

    async function onResChange() {
      localStorage.setItem(UVC_RES_KEY, uvcRes.value)
      const track = uvcStream?.getVideoTracks()[0]
      if (!track) { return }
      const [w, h] = uvcRes.value ? uvcRes.value.split('x').map(Number) : []
      try {
        await track.applyConstraints({ width: w ? { ideal: w } : undefined, height: h ? { ideal: h } : undefined })
        uvcMsg.value = w ? `分辨率已切换为 ${w}×${h}` : '分辨率已恢复默认'
      }
      catch (e) {
        uvcMsg.value = `分辨率切换失败：${e.message}`
      }
    }

    function rotate() { rot.value = (rot.value + 90) % 360 }
    function toggleMirror() { mirror.value = !mirror.value }

    /** canvas 抽帧：旋转/镜像感知，JPEG 0.92；落盘经 capture.saveCapturedImage 供打印 */
    async function uvcShot() {
      const video = uvcVideo.value
      if (!uvcStream || !video?.videoWidth) { uvcMsg.value = '摄像头未就绪'; return }
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
        const savedPath = /** @type {string} */ (await call('capture.saveCapturedImage', { imageDataUrl: dataUrl, imageExtension: 'jpg' }))
        pushRecord({ thumbDataUrl: dataUrl, imagePath: savedPath, source: '本机摄像头' })
        uvcMsg.value = '拍摄完成'
      }
      catch (e) {
        // 落盘失败仍保留缩略记录（可看不可打）
        pushRecord({ thumbDataUrl: dataUrl, imagePath: null, source: '本机摄像头' })
        uvcMsg.value = `保存失败：[${e.code}] ${e.message}（缩略图已留存）`
      }
    }

    function pushRecord(rec) {
      currentRec.value = rec
      records.value.unshift({ ...rec, time: new Date().toLocaleTimeString() })
      if (records.value.length > 12) { records.value.pop() }
    }

    function pickRecord(rec) {
      currentRec.value = rec
    }

    function clearRecords() {
      records.value = []
      currentRec.value = null
      uvcMsg.value = '已清空拍摄记录'
    }

    /** 打印此图：抓拍文件路径直通 print 域 file 负载 */
    async function printRecord() {
      if (!currentRec.value?.imagePath) { return }
      try {
        const r = /** @type {{ jobId: string }} */ (await call('print.submitPrintJob', {
          printContent: { kind: 'file', path: currentRec.value.imagePath },
          printOptions: { paper: 'a4', copies: 1, silent: true, jobName: 'devconsole 抓拍' },
        }))
        uvcMsg.value = `已提交打印：${r.jobId}`
      }
      catch (e) {
        uvcMsg.value = `打印失败：[${e.code}] ${e.message}`
      }
    }

    /** 原生浮层拍摄：invoke 挂起至确认（结果数组）/取消（空数组），发起 tab 销毁平台自动作废 */
    async function openDialog() {
      dlgBusy.value = true
      dlgDone.value = false
      dlgResults.value = []
      try {
        const input = {
          title: dlgTitle.value || undefined,
          maxCount: dlgMax.value > 0 ? dlgMax.value : undefined,
          deviceId: dlgDeviceId.value || undefined,
          deviceLabel: dlgDeviceId.value
            ? devices.value?.find(d => d.id === dlgDeviceId.value)?.displayName
            : undefined,
        }
        const results = await call('capture.openCaptureDialog', input)
        dlgResults.value = Array.isArray(results) ? results : []
        dlgDone.value = !dlgResults.value.length
      }
      finally {
        dlgBusy.value = false
      }
    }

    async function startPreview() {
      await call('capture.startPreview', previewDeviceId.value ? { deviceId: previewDeviceId.value } : undefined)
      unsubscribe?.()
      unsubscribe = onDeviceEvent('capture.frame', (payload) => {
        frameCount.value++
        if (payload?.frame) { frameUrl.value = payload.frame }
      })
      previewing.value = true
    }

    async function stopPreview() {
      await call('capture.stopPreview', { deviceId: previewDeviceId.value })
      teardownListener()
      previewing.value = false
    }

    function teardownListener() {
      unsubscribe?.()
      unsubscribe = null
    }

    /** 离开面板 = 停 UVC 流 + 停预览 + 退订帧 */
    async function teardown() {
      teardownListener()
      stopUvcStream()
      if (previewing.value) {
        await call('capture.stopPreview', { deviceId: previewDeviceId.value }).catch(() => {})
        previewing.value = false
      }
    }

    async function onCaptured({ result }) {
      shot.value = result
    }
    async function saveShot() {
      if (!shot.value?.dataUrl) { return }
      await call('capture.saveCapturedImage', { imageDataUrl: shot.value.dataUrl, imageExtension: 'png' })
    }

    /** mock 桥下手动产生一帧，验证帧渲染链路 */
    function mockFrame() {
      emitMockEvent('capture.frame', { deviceId: previewDeviceId.value, frame: demoFrame() })
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

    return {
      UVC_PREFIX, UVC_RESOLUTIONS,
      devices, previewing, previewDeviceId, frameUrl, frameCount, shot, bridgeReal,
      captureImageDef,
      dlgTitle, dlgMax, dlgDeviceId, dlgBusy, dlgDone, dlgResults, openDialog,
      loadDevices, startPreview, stopPreview, onCaptured, saveShot, mockFrame,
      cams, uvcSel, uvcLive, uvcMsg, rot, mirror, uvcRes, records, currentRec, uvcVideo, mediaTransform,
      openCamera, closeCamera, onResChange, rotate, toggleMirror, uvcShot, pickRecord, clearRecords, printRecord,
    }
  },
})

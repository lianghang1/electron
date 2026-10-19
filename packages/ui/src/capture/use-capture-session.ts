import type { CaptureCameraInfo, CaptureDevice, CaptureDialogSession, CaptureResult } from '@desktop/shared'
import type { ComputedRef, Ref } from 'vue'
import { computed, onBeforeUnmount, ref } from 'vue'

/** 本机摄像头设备 id 前缀（与平台 devices 测试页约定一致） */
const UVC_PREFIX = 'uvc:'
/** UVC 常用分辨率档（getUserMedia ideal 约束，设备不支持时自动回落） */
const UVC_RESOLUTIONS = ['1920x1080', '1280x720', '960x540', '640x480']

/** 预览路线：uvc = 渲染层 getUserMedia；ws = Main 会话推帧；other = 仅会话内拍照 */
export type CapturePreviewKind = 'uvc' | 'ws' | 'other'

export interface ResolutionOption {
  /** '' = 设备默认档；uvc 为 "宽x高"，ws 为档位序号（resolutionNum） */
  value: string
  label: string
}

/** 拍摄浮层会话视图状态与动作（桥接线全部收口在此，组件只管渲染） */
export interface CaptureSessionUi {
  devices: Ref<CaptureDevice[]>
  cameras: Ref<MediaDeviceInfo[]>
  deviceId: Ref<string>
  resolutions: Ref<ResolutionOption[]>
  resolution: Ref<string>
  kind: ComputedRef<CapturePreviewKind>
  /** 设备枚举进行中（列表加载态） */
  loadingDevices: Ref<boolean>
  /** 分辨率切换进行中（重启预览 / 重协商约束） */
  switching: Ref<boolean>
  /** 预览是否开启（uvc 已拿流 / ws 会话推送中） */
  live: Ref<boolean>
  /** ws 预览帧（JPEG dataURL） */
  frameSrc: Ref<string>
  stream: Ref<MediaStream | null>
  rotate: Ref<number>
  mirror: Ref<boolean>
  capturing: Ref<boolean>
  /** 已拍结果（确认前由浮层 UI 收集；maxCount=1 时每拍替换） */
  results: Ref<CaptureResult[]>
  /** 可拍摄张数（会话 maxCount，缺省 1） */
  maxCount: ComputedRef<number>
  /** 已拍满（达到 maxCount，拍摄按钮应禁用） */
  full: ComputedRef<boolean>
  /** 可确认回传（至少拍了一张） */
  canConfirm: ComputedRef<boolean>
  confirming: Ref<boolean>
  error: Ref<string>
  refreshDevices: () => Promise<void>
  changeDevice: (value: string) => Promise<void>
  toggleLive: () => Promise<void>
  changeResolution: (value: string) => Promise<void>
  shoot: () => Promise<void>
  removeResult: (index: number) => void
  confirm: () => Promise<void>
  rotateOnce: () => void
  toggleMirror: () => void
  clearError: () => void
}

/**
 * 拍摄浮层桥接会话：设备枚举 / 预览开关（UVC 自拿流与 ws 推帧双路线）/ 抽帧拍摄 /
 * 结果收集与清理。仅在拍摄浮层窗内使用；组件随会话 key 重建（OverlayApp 按 sessionId 挂 key）。
 */
export function useCaptureSession(
  session: CaptureDialogSession,
  getVideoEl: () => HTMLVideoElement | null,
): CaptureSessionUi {
  const devices = ref<CaptureDevice[]>([])
  const cameras = ref<MediaDeviceInfo[]>([])
  const deviceId = ref(session.deviceId ?? '')
  const resolutions = ref<ResolutionOption[]>([])
  const resolution = ref('')
  const kind = computed<CapturePreviewKind>(() => deviceKind(deviceId.value))
  const loadingDevices = ref(false)
  const switching = ref(false)
  const live = ref(false)
  const frameSrc = ref('')
  const stream = ref<MediaStream | null>(null)
  const rotate = ref(0)
  const mirror = ref(false)
  const capturing = ref(false)
  const confirming = ref(false)
  const results = ref<CaptureResult[]>([])
  const error = ref('')
  const maxCount = computed(() => session.maxCount && session.maxCount >= 1 ? session.maxCount : 1)
  const full = computed(() => results.value.length >= maxCount.value)
  const canConfirm = computed(() => results.value.length > 0)
  let frameUnsub: (() => void) | null = null

  // ---- 设备枚举与选择 ----

  async function refreshDevices(): Promise<void> {
    loadingDevices.value = true
    try {
      devices.value = await window.desktop.capture.listDevices()
    }
    catch (err) {
      devices.value = []
      showError(describeError(err, '设备枚举失败'))
    }
    finally {
      loadingDevices.value = false
    }
    try {
      cameras.value = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')
    }
    catch {
      cameras.value = []
    }
    syncSelection()
    await syncResolutions()
  }

  /** 设备下拉当前值失效时回落：会话预选 id → 设备名二次匹配 → 第一项 */
  function syncSelection(): void {
    const ids = [...devices.value.map(d => d.id), ...cameras.value.map(c => `${UVC_PREFIX}${c.deviceId}`)]
    if (deviceId.value && ids.includes(deviceId.value)) { return }
    const byId = session.deviceId && ids.includes(session.deviceId) ? session.deviceId : ''
    const byLabel = matchCameraByLabel()
    deviceId.value = byId || byLabel || (ids[0] ?? '')
  }

  /** UVC 兜底：摄像头 deviceId 按窗口 session 随机化，发起页的 id 在浮层枚举中不存在，按设备名匹配 */
  function matchCameraByLabel(): string {
    if (!session.deviceLabel) { return '' }
    const cam = cameras.value.find(c => c.label === session.deviceLabel)
    return cam ? `${UVC_PREFIX}${cam.deviceId}` : ''
  }

  async function changeDevice(value: string): Promise<void> {
    if (value === deviceId.value) { return }
    // 切换前预览开启：切到新设备后自动重开预览（失败经 toggleLive 显错，不阻断）
    const wasLive = live.value
    await stopLive()
    deviceId.value = value
    resolution.value = ''
    await syncResolutions()
    if (wasLive && deviceId.value) {
      await toggleLive()
    }
  }

  async function syncResolutions(): Promise<void> {
    const k = deviceKind(deviceId.value)
    if (k === 'uvc') {
      resolutions.value = [{ value: '', label: '默认' }, ...UVC_RESOLUTIONS.map(r => ({ value: r, label: r }))]
      return
    }
    if (k === 'other') {
      resolutions.value = []
      return
    }
    // ws：枚举摄像头档位，优先文档摄像头（funcType=1），无档位 = 仅设备默认
    try {
      const cams: CaptureCameraInfo[] = await window.desktop.capture.listCameras(deviceId.value)
      const cam = cams.find(c => c.funcType === 1) ?? cams[0]
      resolutions.value = cam?.resolutions?.length
        ? [{ value: '', label: '默认' }, ...cam.resolutions.map((r, i) => ({ value: String(i), label: r }))]
        : []
    }
    catch {
      resolutions.value = []
    }
  }

  // ---- 预览 ----

  async function toggleLive(): Promise<void> {
    if (live.value) {
      await stopLive()
      return
    }
    if (!deviceId.value) {
      showError('请先选择采集设备')
      return
    }
    try {
      if (kind.value === 'uvc') { stream.value = await openUvcCamera(deviceId.value, resolution.value) }
      else { await startWsPreview(deviceId.value) }
      live.value = true
    }
    catch (err) {
      showError(describeError(err, '开启预览失败'))
    }
  }

  async function startWsPreview(id: string): Promise<void> {
    if (!frameUnsub) {
      frameUnsub = window.desktop.events.on('capture:frameReceived', (frame) => {
        if (frame.deviceId !== deviceId.value) { return }
        // 新帧到达即回实时画面（覆盖可能展示的拍摄记录）
        frameSrc.value = `data:image/jpeg;base64,${frame.base64}`
      })
    }
    const opts = resolution.value === '' ? undefined : { resolutionNum: Number(resolution.value) }
    await window.desktop.capture.dialogStartPreview({ deviceId: id, resolutionNum: opts?.resolutionNum })
  }

  async function stopLive(): Promise<void> {
    stopUvcStream()
    if (deviceKind(deviceId.value) === 'ws' && deviceId.value) {
      try {
        await window.desktop.capture.dialogStopPreview()
      }
      catch {
        // 会话可能已被 Main 回收（设备掉线等），停止失败不阻断 UI
      }
    }
    live.value = false
    frameSrc.value = ''
  }

  async function changeResolution(value: string): Promise<void> {
    resolution.value = value
    if (!live.value) { return }
    switching.value = true
    try {
      if (kind.value === 'uvc') {
        const track = stream.value?.getVideoTracks()[0]
        if (!track) { return }
        const [w, h] = parseWxH(value)
        try {
          await track.applyConstraints({ width: w ? { ideal: w } : undefined, height: h ? { ideal: h } : undefined })
        }
        catch (err) {
          showError(describeError(err, '分辨率切换失败'))
        }
        return
      }
      // ws：重启预览会话使新档位生效
      await stopLive()
      await toggleLive()
    }
    finally {
      switching.value = false
    }
  }

  // ---- 拍摄 ----

  async function shoot(): Promise<void> {
    if (capturing.value || full.value) { return }
    capturing.value = true
    try {
      let result: CaptureResult
      if (kind.value === 'uvc') {
        const frame = grabUvcFrame()
        if (!frame) {
          showError('摄像头未就绪，请稍候重试')
          return
        }
        // 落盘走全尺寸 dataURL；展示/回传换本地小缩略图，避免大 payload 两跳 IPC 造成卡顿
        const thumb = grabUvcThumb()
        result = await window.desktop.capture.dialogCapture({
          dataUrl: frame.dataUrl,
          // 成片像素随 meta 回传（测试/业务方可在结果里核对分辨率档位是否生效）
          meta: { width: frame.width, height: frame.height, transport: 'uvc' },
        })
        if (thumb) { result = { ...result, thumbDataUrl: thumb } }
      }
      else {
        result = await window.desktop.capture.dialogCapture()
      }
      // maxCount=1：每次拍摄替换前一张；>1：最新在前追加，拍满由 full 拦截
      results.value = maxCount.value === 1 ? [result] : [result, ...results.value]
    }
    catch (err) {
      showError(describeError(err, '拍摄失败'))
    }
    finally {
      capturing.value = false
    }
  }

  function removeResult(index: number): void {
    if (index < 0 || index >= results.value.length) { return }
    results.value.splice(index, 1)
  }

  /**
   * 确认回传：结果一次交给 Main（Main 先 resolve 发起页 Promise，宽限片刻再收浮层）。
   * IPC 走 structured clone，必须传纯对象快照——Vue 响应式 Proxy 无法克隆
   */
  async function confirm(): Promise<void> {
    if (confirming.value || !canConfirm.value) { return }
    confirming.value = true
    try {
      const snapshot = results.value.map(r => ({
        imagePath: r.imagePath,
        thumbDataUrl: r.thumbDataUrl,
        meta: r.meta ? { ...r.meta } : undefined,
      }))
      await window.desktop.capture.dialogConfirm(snapshot)
      // 确认成功：保持「回传中」锁定直到组件随浮层收场卸载，宽限窗口内不可再操作
    }
    catch (err) {
      confirming.value = false
      showError(describeError(err, '回传失败'))
    }
  }

  /** UVC 抽帧绘制共用：按旋转/镜像变换把当前视频帧画到画布 */
  function drawFrameTo(canvas: HTMLCanvasElement, video: HTMLVideoElement): boolean {
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw) { return false }
    const deg = ((rotate.value % 360) + 360) % 360
    const swap = deg === 90 || deg === 270
    canvas.width = swap ? vh : vw
    canvas.height = swap ? vw : vh
    const ctx = canvas.getContext('2d')
    if (!ctx) { return false }
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((rotate.value * Math.PI) / 180)
    ctx.scale(mirror.value ? -1 : 1, 1)
    ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh)
    return true
  }

  /** UVC 全尺寸抽帧（落盘用，JPEG q0.92），返回尺寸供 meta 透传 */
  function grabUvcFrame(): { dataUrl: string, width: number, height: number } | null {
    const video = getVideoEl()
    if (!stream.value || !video?.videoWidth) { return null }
    const canvas = document.createElement('canvas')
    if (!drawFrameTo(canvas, video)) { return null }
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height }
  }

  /** UVC 缩略抽帧：高 160px 小图（结果展示 + 回传轻量化） */
  function grabUvcThumb(): string | null {
    const video = getVideoEl()
    if (!stream.value || !video?.videoWidth) { return null }
    const full = document.createElement('canvas')
    if (!drawFrameTo(full, video)) { return null }
    const canvas = document.createElement('canvas')
    canvas.height = 160
    canvas.width = Math.round((full.width * 160) / full.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) { return null }
    ctx.drawImage(full, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  }

  // ---- 展示辅助与清理 ----

  function rotateOnce(): void {
    rotate.value = (rotate.value + 90) % 360
  }

  function toggleMirror(): void {
    mirror.value = !mirror.value
  }

  let errorTimer: ReturnType<typeof setTimeout> | null = null

  /** 错误提示统一入口：浮动展示不占布局，4s 自动消失 */
  function showError(message: string): void {
    error.value = message
    if (errorTimer) { clearTimeout(errorTimer) }
    errorTimer = setTimeout(() => {
      error.value = ''
      errorTimer = null
    }, 4000)
  }

  function clearError(): void {
    if (errorTimer) {
      clearTimeout(errorTimer)
      errorTimer = null
    }
    error.value = ''
  }

  function stopUvcStream(): void {
    stream.value?.getTracks().forEach(t => t.stop())
    stream.value = null
  }

  function dispose(): void {
    stopUvcStream()
    if (frameUnsub) {
      frameUnsub()
      frameUnsub = null
    }
    if (errorTimer) {
      clearTimeout(errorTimer)
      errorTimer = null
    }
    if (live.value && deviceKind(deviceId.value) === 'ws') {
      // 卸载收尾：Main 侧会话可能已随会话关闭回收，失败不阻断卸载
      void window.desktop.capture.dialogStopPreview().catch(() => {})
    }
    live.value = false
  }

  onBeforeUnmount(dispose)

  return {
    devices,
    cameras,
    deviceId,
    resolutions,
    resolution,
    kind,
    loadingDevices,
    switching,
    live,
    frameSrc,
    stream,
    rotate,
    mirror,
    capturing,
    results,
    maxCount,
    full,
    canConfirm,
    confirming,
    error,
    refreshDevices,
    changeDevice,
    toggleLive,
    changeResolution,
    shoot,
    removeResult,
    confirm,
    rotateOnce,
    toggleMirror,
    clearError,
  }
}

function deviceKind(id: string): CapturePreviewKind {
  if (id.startsWith(UVC_PREFIX)) { return 'uvc' }
  return id.split(':')[0] === 'ws' ? 'ws' : 'other'
}

/** UVC 分辨率档 "宽x高" → 约束值（'' = 默认档） */
function parseWxH(value: string): [number, number] {
  if (!value) { return [0, 0] }
  const [w, h] = value.split('x').map(Number)
  return [w ?? 0, h ?? 0]
}

function describeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${fallback}：${message || '未知错误'}`
}

async function openUvcCamera(id: string, resolution: string): Promise<MediaStream> {
  const raw = id.slice(UVC_PREFIX.length)
  const [w, h] = parseWxH(resolution)
  return navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: raw ? { exact: raw } : undefined,
      width: w ? { ideal: w } : { ideal: 1920 },
      height: h ? { ideal: h } : { ideal: 1080 },
    },
    audio: false,
  })
}

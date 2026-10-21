'use strict'
/* 采集域：capture 通道（高拍仪/扫描仪）+ UVC 路线（getUserMedia 预览/抽帧）+ ws 高拍仪实时预览，拍摄产物可一键打印 */

const UVC_PREFIX = 'uvc:'
const UVC_RESOLUTIONS = ['1920x1080', '1280x720', '960x540', '640x480']
let captureDevices = []
let cameras = []
let records = []
let stream = null
let current = null
let rot = 0
let mirror = false
/** ws 高拍仪预览会话是否开启（main 进程持会话，本页只跟踪状态） */
let wsPreviewOn = false

function capIsUvc() { return $('#cap-device').value.startsWith(UVC_PREFIX) }

/** 当前所选设备类型：uvc（本机摄像头）/ camsdk（CamSDK WS 高拍仪）/ other（SDK 直连或未加载档案） */
function capKind() {
  if (capIsUvc()) return 'uvc'
  const p = capSelectedConfig()
  return p?.ws?.protocol === 'camsdk' ? 'camsdk' : 'other'
}

function capToggleOpButtons() {
  const kind = capKind()
  const live = kind === 'uvc' ? !!stream : kind === 'camsdk' && wsPreviewOn
  $('#btn-cap-open').hidden = kind === 'other' || live
  $('#btn-cap-open').textContent = kind === 'camsdk' ? '开启预览' : '开启摄像头'
  $('#btn-cap-close').hidden = !live
  $('#btn-cap-shot').textContent = kind === 'uvc' && live ? '拍摄（抽帧）' : '拍摄'
  $('#cap-resolution').disabled = kind === 'other'
}

async function refreshCaptureDevices() {
  try {
    captureDevices = await window.desktop.capture.listDevices()
  }
  catch { captureDevices = [] }
  try {
    cameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')
  }
  catch { cameras = [] }

  const sel = $('#cap-device')
  const prev = sel.value
  sel.innerHTML = [
    captureDevices.length ? `<optgroup label="高拍仪 / 采集设备">${captureDevices.map(d =>
      `<option value="${esc(d.id)}">${esc(d.displayName)}（${esc(TRANSPORT_LABEL[d.transport] ?? d.transport)}${d.status === 'ready' ? '' : ' · 不可用'}）</option>`).join('')}</optgroup>` : '',
    cameras.length ? `<optgroup label="本机摄像头">${cameras.map((c, i) =>
      `<option value="${UVC_PREFIX}${esc(c.deviceId)}">${esc(c.label || `摄像头 ${i + 1}`)}</option>`).join('')}</optgroup>` : '',
  ].join('')
  if (!sel.innerHTML) sel.innerHTML = '<option value="">未检测到设备</option>'
  sel.value = prev && [...sel.options].some(o => o.value === prev) ? prev : sel.options[0]?.value ?? ''
  capToggleOpButtons()
  syncCapConfig()
}

function stopStream() {
  stream?.getTracks().forEach(t => t.stop())
  stream = null
}

/** 关闭当前设备的实时画面（UVC 流 + ws 预览会话） */
async function stopAllLive() {
  stopStream()
  const deviceId = $('#cap-device').value
  if (wsPreviewOn && deviceId) {
    wsPreviewOn = false
    try { await window.desktop.capture.stopPreview(deviceId) }
    catch { /* 会话可能已掉线，忽略 */ }
  }
}

async function openCamera() {
  const deviceId = $('#cap-device').value.slice(UVC_PREFIX.length)
  if (!deviceId) { toast('请先选择一个本机摄像头', false); return }
  try {
    stopStream()
    const [w, h] = $('#cap-resolution').value ? $('#cap-resolution').value.split('x').map(Number) : []
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: w ? { ideal: w } : { ideal: 1920 }, height: h ? { ideal: h } : { ideal: 1080 } },
      audio: false,
    })
    $('#cap-stage').innerHTML = '<video playsinline muted></video>'
    const video = $('#cap-stage video')
    video.srcObject = stream
    await video.play()
    applyPreviewTransform()
    capToggleOpButtons()
    void refreshCaptureDevices() // 授权后标签才填充，重新枚举
  }
  catch (e) {
    toast(`摄像头打开失败：${e.message}`, false)
    capToggleOpButtons()
  }
}

// ── ws 高拍仪实时预览：main 进程常驻会话推帧，本页只负责展示与状态 ──

async function startWsPreview() {
  const deviceId = $('#cap-device').value
  if (!deviceId) { toast('请先选择采集设备', false); return }
  try {
    const opts = { resolutionNum: currentResolutionNum() }
    await window.desktop.capture.startPreview({ deviceId, resolutionNum: opts?.resolutionNum })
    wsPreviewOn = true
    $('#cap-stage').innerHTML = '<img id="cap-live" alt="实时预览">'
    applyPreviewTransform()
    toast('预览已开启，可随时拍摄')
  }
  catch (e) { toast(`预览失败：${e.message ?? '未知错误'}`, false) }
  finally { capToggleOpButtons() }
}

window.desktop?.events?.on('capture:frameReceived', (frame) => {
  if (!wsPreviewOn || frame.deviceId !== $('#cap-device').value) return
  // 新帧到达即回到实时画面（浏览拍摄记录时来新帧 = 自动回直播）
  const live = $('#cap-live')
  if (!live) return
  live.src = `data:image/jpeg;base64,${frame.base64}`
  live.hidden = false
  const shot = $('#cap-shot')
  if (shot) shot.hidden = true
})

function applyPreviewTransform() {
  const medias = document.querySelectorAll('#cap-stage video, #cap-stage img')
  medias.forEach((m) => { m.style.transform = `rotate(${rot}deg) ${mirror ? 'scaleX(-1)' : ''}` })
}

/** 分辨率下拉当前值 → camsdk 分辨率序号（空 = 默认，不传） */
function currentResolutionNum() {
  const v = $('#cap-resolution').value
  return v === '' ? undefined : Number(v)
}

function pushRecord(result, source) {
  current = result
  records.unshift({ result, time: fmtTime(Date.now()), source })
  if (records.length > 12) records.pop()
  $('#btn-cap-print').disabled = !current?.imagePath
  $('#cap-records').innerHTML = records.map((r, i) => {
    const m = r.result.meta || {}
    const size = m.width && m.height ? `，成片 ${m.width}×${m.height}` : ''
    const path = r.result.imagePath ? `&#10;已保存：${esc(r.result.imagePath)}` : ''
    return `<img src="${r.result.thumbDataUrl}" title="${esc(r.source)} ${r.time}${size}${path}" data-rec="${i}">`
  }).join('')
}

async function captureUvcFrame() {
  const video = $('#cap-stage video')
  if (!stream || !video?.videoWidth) { toast('摄像头未就绪', false); return }
  const swap = ((rot % 360) + 360) % 360 === 90 || ((rot % 360) + 360) % 360 === 270
  const vw = video.videoWidth
  const vh = video.videoHeight
  const canvas = document.createElement('canvas')
  canvas.width = swap ? vh : vw
  canvas.height = swap ? vw : vh
  const ctx = canvas.getContext('2d')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.scale(mirror ? -1 : 1, 1)
  ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  try {
    const imagePath = await window.desktop.capture.saveDataUrl({ dataUrl, ext: 'jpg' })
    pushRecord({ imagePath, thumbDataUrl: dataUrl }, '本机摄像头')
    toast('拍摄完成')
  }
  catch (e) { toast(e.message, false) }
}

async function captureByDevice() {
  const deviceId = $('#cap-device').value
  if (!deviceId) { toast('请先选择采集设备', false); return }
  try {
    const r = await window.desktop.capture.snap({ deviceId, resolutionNum: currentResolutionNum() })
    pushRecord(r, captureDevices.find(d => d.id === deviceId)?.displayName ?? '设备')
    toast('拍摄完成')
  }
  catch (e) { toast(`拍摄失败：${e.message ?? '未知错误'}`, false) }
}

$('#cap-device').addEventListener('change', async () => {
  await stopAllLive()
  $('#cap-stage').innerHTML = '<span class="placeholder">选择设备后拍摄</span>'
  current = null
  $('#btn-cap-print').disabled = true
  capToggleOpButtons()
  syncCapConfig()
  void syncResolutionOptions()
})
$('#btn-cap-open').addEventListener('click', () => void (capKind() === 'camsdk' ? startWsPreview() : openCamera()))
$('#btn-cap-close').addEventListener('click', async () => {
  await stopAllLive()
  $('#cap-stage').innerHTML = '<span class="placeholder">选择设备后拍摄</span>'
  capToggleOpButtons()
})
$('#btn-cap-shot').addEventListener('click', () => void (capIsUvc() && stream ? captureUvcFrame() : captureByDevice()))
$('#btn-cap-rotate').addEventListener('click', () => { rot = (rot + 90) % 360; applyPreviewTransform() })
$('#btn-cap-mirror').addEventListener('click', (e) => {
  mirror = !mirror
  e.target.classList.toggle('on', mirror)
  applyPreviewTransform()
})
$('#cap-records').addEventListener('click', (e) => {
  const r = records[e.target.dataset?.rec]
  if (!r) return
  current = r.result
  const stage = $('#cap-stage')
  let shot = $('#cap-shot')
  if (!shot) {
    stage.insertAdjacentHTML('beforeend', '<img id="cap-shot" alt="拍摄记录">')
    shot = $('#cap-shot')
  }
  shot.src = current.thumbDataUrl
  shot.hidden = false
  const live = $('#cap-live')
  if (live) live.hidden = true
  applyPreviewTransform()
})
$('#btn-cap-clear').addEventListener('click', () => {
  records = []
  current = null
  $('#cap-records').innerHTML = ''
  $('#btn-cap-print').disabled = true
  $('#cap-shot')?.remove()
  if (!wsPreviewOn && !stream) {
    $('#cap-stage').innerHTML = '<span class="placeholder">选择设备后拍摄</span>'
  }
  toast('已清空拍摄记录')
})
$('#btn-cap-print').addEventListener('click', async () => {
  if (!current?.imagePath) return
  try {
    const r = await window.desktop.print.submit({
      payload: { kind: 'file', path: current.imagePath },
      options: { paper: 'a4', copies: 1, silent: true, jobName: '高拍仪图片' },
    })
    toast(`已提交打印：${r.jobId}`)
  }
  catch (e) { toast(`打印失败：${e.message ?? '未知错误'}`, false) }
})

// ── 分辨率选择：camsdk 用设备枚举档位（存 localStorage），UVC 常用档走 applyConstraints ──

function capResolutionKey() {
  const kind = capKind()
  if (kind === 'uvc') return 'cap-res:uvc'
  const p = capSelectedConfig()
  return p ? `cap-res:${p.id}` : null
}

async function syncResolutionOptions() {
  const sel = $('#cap-resolution')
  const kind = capKind()
  if (kind === 'other') {
    sel.innerHTML = '<option value="">由设备端输出</option>'
    return
  }
  if (kind === 'uvc') {
    sel.innerHTML = '<option value="">默认</option>' + UVC_RESOLUTIONS.map(r => `<option value="${r}">${r}</option>`).join('')
    sel.value = localStorage.getItem('cap-res:uvc') ?? ''
    return
  }
  // camsdk：所选摄像头（配置 camId）的枚举分辨率；服务离线时退回默认档
  const p = capSelectedConfig()
  const cams = p ? await fetchCamerasSafe(`ws:${p.id}`) : null
  const cam = cams?.find(c => c.id === (p.ws.camId ?? 0)) ?? cams?.[0]
  if (!cam?.resolutions?.length) {
    sel.innerHTML = '<option value="">默认</option>'
    return
  }
  sel.innerHTML = '<option value="">默认</option>' + cam.resolutions.map((r, i) => `<option value="${i}">${esc(r)}</option>`).join('')
  const saved = localStorage.getItem(`cap-res:${p.id}`)
  sel.value = saved !== null && Number(saved) < cam.resolutions.length ? saved : ''
}

$('#cap-resolution').addEventListener('change', async () => {
  const key = capResolutionKey()
  if (key) localStorage.setItem(key, $('#cap-resolution').value)
  if (capKind() === 'uvc') {
    const track = stream?.getVideoTracks()[0]
    if (!track) return
    const [w, h] = $('#cap-resolution').value ? $('#cap-resolution').value.split('x').map(Number) : []
    try {
      await track.applyConstraints({ width: w ? { ideal: w } : undefined, height: h ? { ideal: h } : undefined })
      toast(w ? `分辨率已切换为 ${w}×${h}` : '分辨率已恢复默认')
    }
    catch (e) { toast(`分辨率切换失败：${e.message}`, false) }
    return
  }
  // camsdk：预览开启中则用新分辨率重启会话
  if (wsPreviewOn) {
    const deviceId = $('#cap-device').value
    wsPreviewOn = false
    try { await window.desktop.capture.stopPreview(deviceId) }
    catch { /* 忽略 */ }
    await startWsPreview()
  }
})

// ── 内置 UI 拍摄浮层：发起后预览/拍摄在浮层窗闭环，结果随 openCaptureDialog 的 Promise 回传本页 ──

$('#btn-cap-dialog').addEventListener('click', async () => {
  const sel = $('#cap-device')
  const deviceId = sel.value || undefined
  console.log('deviceId', deviceId)
  // UVC 摄像头的 deviceId 跨窗口随机化，必须带设备名供浮层二次匹配
  const deviceLabel = sel.selectedOptions[0]?.label || undefined
  try {
    // maxCount=3 便于连拍多张看效果；缺省 maxCount=1 每拍一张替换前一张
    const results = await window.desktop.capture.openCaptureDialog({ deviceId, deviceLabel, title: '拍摄浮层', maxCount: 3 })
    console.log(results)
    for (const r of results) { pushRecord(r, '拍摄浮层') }
    if (results.length) { toast(`拍摄完成（${results.length} 张）`) }
  }
  catch (e) { toast(`拍摄浮层失败：${e.message ?? '未知错误'}`, false) }
})

registerRefresher(refreshCaptureDevices)

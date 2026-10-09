'use strict'
/* 采集域：capture 通道（高拍仪/扫描仪）+ UVC 路线（getUserMedia 预览/抽帧），拍摄产物可一键打印 */

const UVC_PREFIX = 'uvc:'
let captureDevices = []
let cameras = []
let records = []
let stream = null
let current = null
let rot = 0
let mirror = false

function capIsUvc() { return $('#cap-device').value.startsWith(UVC_PREFIX) }
function capToggleOpButtons() {
  const uvc = capIsUvc()
  const on = uvc && !!stream
  $('#btn-cap-open').hidden = !uvc || on
  $('#btn-cap-close').hidden = !uvc || !on
  $('#btn-cap-shot').textContent = uvc ? (on ? '拍摄（抽帧）' : '拍摄') : '拍摄'
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
}

function stopStream() {
  stream?.getTracks().forEach(t => t.stop())
  stream = null
}

async function openCamera() {
  const deviceId = $('#cap-device').value.slice(UVC_PREFIX.length)
  if (!deviceId) { toast('请先选择一个本机摄像头', false); return }
  try {
    stopStream()
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
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

function applyPreviewTransform() {
  const media = $('#cap-stage video') ?? $('#cap-stage img')
  if (media) media.style.transform = `rotate(${rot}deg) ${mirror ? 'scaleX(-1)' : ''}`
}

function pushRecord(result, source) {
  current = result
  records.unshift({ result, time: fmtTime(Date.now()), source })
  if (records.length > 12) records.pop()
  $('#btn-cap-print').disabled = !current?.imagePath
  $('#cap-records').innerHTML = records.map((r, i) =>
    `<img src="${r.result.thumbDataUrl}" title="${esc(r.source)} ${r.time}" data-rec="${i}">`).join('')
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
    const imagePath = await window.desktop.capture.saveDataUrl(dataUrl, 'jpg')
    pushRecord({ ok: true, imagePath, thumbDataUrl: dataUrl }, '本机摄像头')
    toast('拍摄完成')
  }
  catch (e) { toast(e.message, false) }
}

async function captureByDevice() {
  const deviceId = $('#cap-device').value
  if (!deviceId) { toast('请先选择采集设备', false); return }
  try {
    const r = await window.desktop.capture.capture({ deviceId })
    if (r.ok) {
      pushRecord(r, captureDevices.find(d => d.id === deviceId)?.displayName ?? '设备')
      toast('拍摄完成')
    }
    else { toast(`拍摄失败：${r.error?.message ?? '未知错误'}`, false) }
  }
  catch (e) { toast(e.message, false) }
}

$('#cap-device').addEventListener('change', () => {
  stopStream()
  $('#cap-stage').innerHTML = '<span class="placeholder">选择设备后拍摄</span>'
  current = null
  $('#btn-cap-print').disabled = true
  capToggleOpButtons()
})
$('#btn-cap-open').addEventListener('click', () => void openCamera())
$('#btn-cap-close').addEventListener('click', () => {
  stopStream()
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
  $('#cap-stage').innerHTML = `<img src="${current.thumbDataUrl}">`
  applyPreviewTransform()
})
$('#btn-cap-print').addEventListener('click', async () => {
  if (!current?.imagePath) return
  try {
    const r = await window.desktop.print.submit({
      businessType: 'image',
      payload: { kind: 'file', path: current.imagePath },
      options: { paper: { preset: 'a4' }, copies: 1, silent: true, jobName: '高拍仪图片' },
    })
    r.ok ? toast(`已提交打印：${r.jobId}`) : toast(`打印失败：${r.error?.message ?? '未知错误'}`, false)
  }
  catch (e) { toast(e.message, false) }
})

registerRefresher(refreshCaptureDevices)
void refreshCaptureDevices()

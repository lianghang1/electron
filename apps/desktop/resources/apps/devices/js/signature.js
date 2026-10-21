'use strict'
/* 签名域：signature 会话（start/stop/clear/cancel）。
   笔迹点模式（dll）：strokeReceived 实时推送，本页 canvas 自绘（板面坐标系 → 画布等比映射）。
   位图模式（ws CamSDK 签名屏）：无笔迹点，签名屏提交后回传签名/指纹图，完成后绘制展示。
   调用失败统一 reject（IpcRemoteError：e.code / e.message），catch 分支展示。 */

const SIGN_TRANSPORT_LABEL = { dll: 'SDK 直连', ws: '本地服务' }
const SIGN_PLACEHOLDER_TEXT = '开始会话后在签名板书写，笔迹实时显示于此'
let signBoard = null // 板面宽高（笔迹点坐标系）
let signActive = false
/** 设备侧产位图模式（ws 厂商）：无笔迹点回调，清板不可用 */
let signBitmap = false
let signStrokes = 0
let sctx = null
let lastPoint = null

function signSessionButtons() {
  $('#btn-sign-stop').disabled = !signActive
  $('#btn-sign-clear').disabled = !signActive || signBitmap
  $('#btn-sign-cancel').disabled = !signActive
  $('#btn-sign-start').disabled = signActive
}

function clearSignCanvas() {
  const cv = $('#sign-canvas')
  if (!sctx) return
  sctx.fillStyle = '#ffffff'
  sctx.fillRect(0, 0, cv.width, cv.height)
  lastPoint = null
}

/** 会话建立：画布内部分辨率 = 板面坐标，显示尺寸由 CSS 等比缩放 */
function initSignCanvas(board) {
  const cv = $('#sign-canvas')
  cv.width = board.width
  cv.height = board.height
  cv.hidden = false
  $('#sign-placeholder').hidden = true
  sctx = cv.getContext('2d')
  sctx.lineWidth = 3
  sctx.lineCap = 'round'
  sctx.lineJoin = 'round'
  sctx.strokeStyle = '#172033'
  clearSignCanvas()
}

function closeSignCanvas() {
  const cv = $('#sign-canvas')
  cv.hidden = true
  const placeholder = $('#sign-placeholder')
  placeholder.hidden = false
  placeholder.textContent = SIGN_PLACEHOLDER_TEXT
  sctx = null
  lastPoint = null
}

async function refreshSignDevices() {
  const sel = $('#sign-device')
  try {
    const devices = await window.desktop.signature.listDevices()
    if (!devices.length) {
      sel.innerHTML = '<option value="">未检测到签名设备</option>'
      return
    }
    const prev = sel.value
    sel.innerHTML = devices.map(d =>
      `<option value="${esc(d.id)}">${esc(d.displayName)}（${esc(SIGN_TRANSPORT_LABEL[d.transport] ?? d.transport)}${d.status === 'ready' ? '' : ` · ${d.status === 'offline' ? '离线' : '不可用'}`}）</option>`).join('')
    sel.value = prev && devices.some(d => d.id === prev) ? prev : sel.options[0].value
  }
  catch (e) {
    sel.innerHTML = `<option value="">签名设备不可用（${esc(e.message)}）</option>`
  }
}

// ── 笔迹点实时绘制：down 起新笔画（画起点圆点），move 连线，up 收笔 ──
window.desktop.events.on('signature:strokeReceived', (p) => {
  if (!sctx) return
  if (p.phase === 'down') {
    sctx.beginPath()
    sctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
    sctx.fillStyle = sctx.strokeStyle
    sctx.fill()
    lastPoint = p
    return
  }
  if (lastPoint) {
    sctx.beginPath()
    sctx.moveTo(lastPoint.x, lastPoint.y)
    sctx.lineTo(p.x, p.y)
    sctx.stroke()
  }
  lastPoint = p.phase === 'up' ? null : p
})

$('#btn-sign-start').addEventListener('click', async () => {
  const status = $('#sign-status')
  try {
    const r = await window.desktop.signature.startSign({ deviceId: $('#sign-device').value || undefined })
    signBoard = { width: r.width, height: r.height }
    signActive = true
    signBitmap = r.meta?.mode === 'bitmap'
    signStrokes = 0
    $('#sign-count').textContent = '笔画 0'
    if (signBitmap) {
      closeSignCanvas()
      $('#sign-placeholder').textContent = '请在签名屏上书写，完成后点击签名屏上的提交'
      status.textContent = '会话中（签名+指纹一体，结果由签名屏回传位图）'
    }
    else {
      status.textContent = `会话中（板面 ${signBoard.width}×${signBoard.height}）`
      initSignCanvas(signBoard)
    }
    signSessionButtons()
    toast('签名会话已开始')
  }
  catch (e) {
    toast(`开始会话失败：${e.message ?? '未知错误'}`, false)
  }
})

/** 位图模式结果展示：签名图铺满画布，指纹图（若有）叠画右下角 */
function drawSignBitmaps(result) {
  if (!result.signImageDataUrl) {
    closeSignCanvas()
    return
  }
  initSignCanvas(signBoard)
  const cv = $('#sign-canvas')
  const sign = new Image()
  sign.onload = () => {
    sctx.drawImage(sign, 0, 0, cv.width, cv.height)
    if (result.fingerImageDataUrl) {
      const finger = new Image()
      finger.onload = () => {
        const w = 180
        const h = w * (finger.height / finger.width)
        sctx.drawImage(finger, cv.width - w - 16, cv.height - h - 16, w, h)
        sctx.strokeRect(cv.width - w - 16, cv.height - h - 16, w, h)
      }
      finger.src = result.fingerImageDataUrl
    }
  }
  sign.src = result.signImageDataUrl
}

$('#btn-sign-stop').addEventListener('click', async () => {
  const status = $('#sign-status')
  try {
    const r = await window.desktop.signature.stopSign()
    signActive = false
    const wasBitmap = signBitmap
    signBitmap = false
    signSessionButtons()
    if (wasBitmap) {
      status.textContent = `会话完成（签名屏回传位图${r.fingerImageDataUrl ? '，含指纹图' : ''}）`
      drawSignBitmaps(r)
      toast('签名完成：已回传签名图')
    }
    else {
      signStrokes = r.strokeCount
      $('#sign-count').textContent = `笔画 ${signStrokes}`
      status.textContent = `会话完成，回收 ${signStrokes} 笔画（${r.strokes.reduce((n, s) => n + s.points.length, 0)} 个采样点）`
      closeSignCanvas()
      toast(`签名完成：${signStrokes} 笔画`)
    }
  }
  catch (e) {
    toast(`回收失败：${e.message ?? '未知错误'}`, false)
  }
})

$('#btn-sign-clear').addEventListener('click', async () => {
  try {
    await window.desktop.signature.clearSign()
    signStrokes = 0
    $('#sign-count').textContent = '笔画 0'
    clearSignCanvas()
    toast('已清板（会话保持）')
  }
  catch (e) {
    toast(`清板失败：${e.message ?? '未知错误'}`, false)
  }
})

$('#btn-sign-cancel').addEventListener('click', async () => {
  try {
    await window.desktop.signature.cancelSign()
    signActive = false
    signBitmap = false
    signStrokes = 0
    $('#sign-count').textContent = '笔画 0'
    $('#sign-status').textContent = '会话已取消（笔迹作废）'
    signSessionButtons()
    closeSignCanvas()
    toast('会话已取消')
  }
  catch (e) {
    toast(`取消失败：${e.message ?? '未知错误'}`, false)
  }
})

registerRefresher(refreshSignDevices)
registerTab('signature', { once: refreshSignDevices, activate: refreshSignDevices })

'use strict'
/* 签名域：signature 会话（start/stop/clear/cancel）+ onStroke 笔迹点 canvas 实时自绘。
   设备只产采样点，签名图完全由本页绘制（板面坐标系 → 画布等比映射）。
   调用失败统一 reject（IpcRemoteError：e.code / e.message），catch 分支展示。 */

const SIGN_TRANSPORT_LABEL = { dll: 'SDK 直连', stub: '模拟' }
let signBoard = null // 板面宽高（笔迹点坐标系）
let signActive = false
let signStrokes = 0
let sctx = null
let lastPoint = null

function signSessionButtons() {
  $('#btn-sign-stop').disabled = !signActive
  $('#btn-sign-clear').disabled = !signActive
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
  $('#sign-placeholder').hidden = false
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
window.desktop.events.on('signature:onStroke', (p) => {
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
    signStrokes = 0
    $('#sign-count').textContent = '笔画 0'
    status.textContent = `会话中（板面 ${signBoard.width}×${signBoard.height}）`
    initSignCanvas(signBoard)
    signSessionButtons()
    toast('签名会话已开始')
  }
  catch (e) {
    toast(`开始会话失败：${e.message ?? '未知错误'}`, false)
  }
})

$('#btn-sign-stop').addEventListener('click', async () => {
  const status = $('#sign-status')
  try {
    const r = await window.desktop.signature.stopSign()
    signStrokes = r.strokeCount
    $('#sign-count').textContent = `笔画 ${signStrokes}`
    status.textContent = `会话完成，回收 ${signStrokes} 笔画（${r.strokes.reduce((n, s) => n + s.points.length, 0)} 个采样点）`
    signActive = false
    signSessionButtons()
    closeSignCanvas()
    toast(`签名完成：${signStrokes} 笔画`)
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
void refreshSignDevices()

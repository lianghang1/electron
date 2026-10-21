'use strict'
/* 扫码域：模拟扫码与 scanReceived/statusUpdated 订阅；接入通道与节奏参数在系统设置弹窗配置 */

let scanHistory = []
/** 输入框为空时的模拟条码（带前缀，覆盖前缀命中链路） */
const SAMPLE_SCAN_CODE = 'PB:1234567890'

function renderScan() {
  const box = $('#scan-list')
  if (!scanHistory.length) {
    box.innerHTML = '<div class="empty">用扫码枪扫一下，或先模拟一条</div>'
    return
  }
  box.innerHTML = scanHistory.map(r => `<div class="row">
    <div class="grow">
      <div class="name mono selectable">${esc(r.code)}</div>
      <div class="sub">${fmtTime(r.timestamp)}${r.prefix ? ` · 去前缀 ${esc(r.rawCode)}` : ''}</div>
    </div>
    ${r.prefix ? `<span class="chip brand">前缀 ${esc(r.prefix)}</span>` : ''}
  </div>`).join('')
}

function pushScan(r) {
  if (scanHistory.some(h => h.timestamp === r.timestamp)) return
  scanHistory.unshift(r)
  if (scanHistory.length > 20) scanHistory.pop()
  renderScan()
}

$('#btn-scan-sim').addEventListener('click', async () => {
  const code = $('#scan-code').value.trim() || SAMPLE_SCAN_CODE
  try {
    pushScan(await window.desktop.scanner.simulate(code))
    toast('已模拟一次扫码')
  }
  catch (e) { toast(e.message, false) }
})
$('#scan-code').addEventListener('keyup', (e) => {
  if (e.key === 'Enter') $('#btn-scan-sim').click()
})
$('#btn-scan-clear').addEventListener('click', () => { scanHistory = []; renderScan() })

window.desktop.events.on('scanner:scanReceived', pushScan)

// HID 通道状态（连接建立/断开/开启失败）实时展示
window.desktop.events.on('scanner:statusUpdated', (s) => {
  $('#scan-hid-status').textContent = s.mode !== 'hid' ? '' : `HID 通道：${s.connected ? `已连接${s.devSN ? `（${s.devSN}）` : ''}` : `不可用${s.note ? ` — ${s.note}` : ''}`}`
})

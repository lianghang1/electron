'use strict'
/* 扫码域：扫码枪配置（键盘仿真 / 厂商 HID 通道）+ 模拟扫码 + scanReceived/statusUpdated 订阅 */

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

/** 键盘仿真专属参数（节奏/码长/前缀过滤）在 HID 通道下失效，置灰防误配 */
function syncScanModeUi() {
  const hid = $('#scan-mode').value === 'hid'
  for (const id of ['scan-timeout', 'scan-minlen', 'scan-endkey', 'scan-prefixes', 'scan-require-prefix']) {
    $(`#${id}`).disabled = hid
  }
}

$('#btn-scan-save').addEventListener('click', async () => {
  const prefixes = $('#scan-prefixes').value.split(',').map(s => s.trim()).filter(Boolean)
  try {
    await window.desktop.scanner.setConfig({
      enabled: $('#scan-enabled').checked,
      mode: $('#scan-mode').value,
      timeout: Number($('#scan-timeout').value),
      minLength: Number($('#scan-minlen').value),
      endKey: $('#scan-endkey').value,
      prefixes,
      requirePrefix: $('#scan-require-prefix').checked,
    })
    toast('扫码枪配置已保存')
  }
  catch (e) { toast(e.message, false) }
})

$('#scan-mode').addEventListener('change', syncScanModeUi)

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

void (async () => {
  try {
    const cfg = await window.desktop.scanner.getConfig()
    $('#scan-enabled').checked = cfg.enabled
    $('#scan-mode').value = cfg.mode ?? 'keyboard'
    $('#scan-timeout').value = cfg.timeout
    $('#scan-minlen').value = cfg.minLength
    $('#scan-endkey').value = cfg.endKey
    $('#scan-prefixes').value = (cfg.prefixes ?? []).join(',')
    $('#scan-require-prefix').checked = cfg.requirePrefix
    syncScanModeUi()
  }
  catch (e) { toast(`读取扫码枪配置失败：${e.message}`, false) }
})()

'use strict'
/* 证卡读取域：device.listReaders 设备枚举 + device.readIdCard（打开 → 认证 → 读取 → 关闭全程锁定，PII 用完即弃不入日志） */

const ID_FIELDS = [
  ['name', '姓名'],
  ['gender', '性别'],
  ['nation', '民族'],
  ['birthDate', '出生日期'],
  ['idNumber', '公民身份号码'],
  ['address', '住址'],
  ['issuer', '签发机关'],
]

const ID_TRANSPORT_LABEL = { dll: 'SDK 直连', stub: '模拟' }

async function refreshReaders() {
  const sel = $('#id-reader')
  try {
    const r = await window.desktop.device.listReaders()
    if (!r.ok) {
      sel.innerHTML = `<option value="">读卡器不可用（${esc(r.error.message)}）</option>`
      return
    }
    if (!r.readers.length) {
      sel.innerHTML = '<option value="">未检测到读卡器</option>'
      return
    }
    const prev = sel.value
    sel.innerHTML = r.readers.map(d =>
      `<option value="${esc(d.id)}">${esc(d.displayName)}（${esc(ID_TRANSPORT_LABEL[d.transport] ?? d.transport)}${d.status === 'ready' ? '' : ` · ${d.status === 'offline' ? '离线' : '不可用'}`}）</option>`).join('')
    sel.value = prev && r.readers.some(d => d.id === prev) ? prev : sel.options[0].value
  }
  catch (e) {
    sel.innerHTML = `<option value="">检测失败（${esc(e.message)}）</option>`
  }
}

function renderIdCard(data) {
  const photo = $('#id-photo')
  if (data.photoDataUrl) {
    photo.src = data.photoDataUrl
    photo.hidden = false
  }
  else {
    photo.hidden = true
  }
  const rows = ID_FIELDS.map(([key, label]) => `
    <div class="row">
      <span class="hint" style="width: 80px; flex-shrink: 0;">${label}</span>
      <span class="name selectable">${esc(data[key] ?? '—')}</span>
    </div>`).join('')
  const validTo = data.validTo ? data.validTo : '—'
  $('#id-fields').innerHTML = rows + `
    <div class="row">
      <span class="hint" style="width: 80px; flex-shrink: 0;">有效期</span>
      <span class="name selectable">${esc(data.validFrom ?? '—')} 至 ${esc(validTo)}</span>
    </div>`
  $('#id-result').hidden = false
}

async function readIdCard() {
  const btn = $('#btn-id-read')
  const status = $('#id-status')
  const deviceId = $('#id-reader').value
  if (!deviceId) {
    toast('未检测到可用读卡器', false)
    return
  }
  btn.disabled = true
  status.textContent = '读取中…'
  try {
    const r = await window.desktop.device.readIdCard({ deviceId })
    if (r.ok && r.data) {
      renderIdCard(r.data)
      status.textContent = '读取成功'
      toast('证卡读取成功')
    }
    else {
      status.textContent = `读取失败：${r.error?.code ?? 'UNKNOWN'} · ${r.error?.message ?? '未知错误'}`
      toast(status.textContent, false)
    }
  }
  catch (e) {
    status.textContent = `调用失败：${e.message}`
    toast(e.message, false)
  }
  finally {
    btn.disabled = false
  }
}

$('#btn-id-read').addEventListener('click', () => void readIdCard())

registerRefresher(refreshReaders)
void refreshReaders()

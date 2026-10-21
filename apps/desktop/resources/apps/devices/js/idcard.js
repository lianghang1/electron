'use strict'
/* idcard 域：身份证阅读器（desktop.idcard.listReaders / readIdCard；打开 → 认证 → 读取 → 关闭全程锁定，PII 用完即弃不入日志） */

const ID_FIELDS = [
  ['name', '姓名'],
  ['gender', '性别'],
  ['nation', '民族'],
  ['birthDate', '出生日期'],
  ['idNumber', '公民身份号码'],
  ['address', '住址'],
  ['issuer', '签发机关'],
]

const ID_TRANSPORT_LABEL = { dll: 'SDK 直连', ws: '本地服务' }

/** 最近一次枚举的身份证阅读器列表 */
let idReaders = []

/** 区块显隐跟随枚举结果：域内设备均具备身份证能力，无设备即隐藏读取区 */
function syncIdSections() {
  $('#sec-id-read').hidden = idReaders.length === 0
}

async function refreshIdReaders() {
  const sel = $('#id-reader')
  try {
    idReaders = await window.desktop.idcard.listReaders()
  }
  catch (e) {
    sel.innerHTML = `<option value="">身份证阅读器不可用（${esc(e.message)}）</option>`
    idReaders = []
    syncIdSections()
    return
  }
  if (!idReaders.length) {
    sel.innerHTML = '<option value="">未检测到身份证阅读器</option>'
    syncIdSections()
    return
  }
  const prev = sel.value
  sel.innerHTML = idReaders.map(d =>
    `<option value="${esc(d.id)}">${esc(d.displayName)}（${esc(ID_TRANSPORT_LABEL[d.transport] ?? d.transport)}${d.status === 'ready' ? '' : ` · ${d.status === 'offline' ? '离线' : '不可用'}`}）</option>`).join('')
  sel.value = prev && idReaders.some(d => d.id === prev) ? prev : sel.options[0].value
  syncIdSections()
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
    toast('未检测到可用身份证阅读器', false)
    return
  }
  btn.disabled = true
  status.textContent = '读取中…'
  try {
    renderIdCard(await window.desktop.idcard.readIdCard({ deviceId }))
    status.textContent = '读取成功'
    toast('证卡读取成功')
  }
  catch (e) {
    status.textContent = `读取失败：${e.code ?? 'UNKNOWN'} · ${e.message ?? '未知错误'}`
    toast(status.textContent, false)
  }
  finally {
    btn.disabled = false
  }
}

$('#btn-id-read').addEventListener('click', () => void readIdCard())
$('#id-reader').addEventListener('change', syncIdSections)

// ── 清空（页签级按钮）：本文件清身份证区，IC 卡页签由 iccard.js 自清 ──

$('#btn-id-clear').addEventListener('click', () => {
  $('#id-result').hidden = true
  $('#id-photo').hidden = true
  $('#id-fields').innerHTML = ''
  $('#id-status').textContent = '选择读卡器后点击读取'
  toast('已清空读卡结果')
})

registerRefresher(refreshIdReaders)
registerTab('idcard', { once: refreshIdReaders, activate: refreshIdReaders })

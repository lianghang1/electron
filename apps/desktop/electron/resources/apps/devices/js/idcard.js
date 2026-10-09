'use strict'
/* 证卡读取域：device.readIdCard（打开 → 认证 → 读取 → 关闭全程锁定，PII 用完即弃不入日志） */

const ID_FIELDS = [
  ['name', '姓名'],
  ['gender', '性别'],
  ['nation', '民族'],
  ['birthDate', '出生日期'],
  ['idNumber', '公民身份号码'],
  ['address', '住址'],
  ['issuer', '签发机关'],
]

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
  btn.disabled = true
  status.textContent = '读取中…'
  try {
    const r = await window.desktop.device.readIdCard()
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

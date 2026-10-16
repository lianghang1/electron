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

const ID_TRANSPORT_LABEL = { dll: 'SDK 直连' }

/** 块数据 hex → 可打印 ASCII 预览：不可打印字节显示为 ·（块内容是任意二进制，hex 为准，预览仅供肉眼核对） */
function toPrintableAscii(hex) {
  let out = ''
  for (let i = 0; i < hex.length; i += 2) {
    const code = Number.parseInt(hex.slice(i, i + 2), 16)
    out += code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : '·'
  }
  return out
}

/** 块数据 hex → 文本（截至第一个 0x00，UTF-8 解码；全空或含乱码返回 null 不展示） */
function toCString(hex) {
  const bytes = []
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16)
    if (byte === 0) {
      break
    }
    bytes.push(byte)
  }
  if (bytes.length === 0) {
    return null
  }
  const text = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  return text.includes('\uFFFD') ? null : text
}

/** 最近一次枚举的读卡器列表（能力联动与回读选中态使用） */
let readers = []

/** 区块显隐跟随所选读卡器的能力：身份证 / IC 读 / IC 写 / 字符串组四块互不越界 */
function syncIdSections() {
  const caps = readers.find(d => d.id === $('#id-reader').value)?.capabilities ?? []
  $('#sec-id-read').hidden = !caps.includes('idcard')
  $('#sec-ic-read').hidden = !caps.includes('iccard')
  $('#sec-ic-write').hidden = !caps.includes('iccard-write')
  $('#sec-ic-texts').hidden = !caps.includes('iccard')
  $('#btn-ic-t-write').hidden = !caps.includes('iccard-write')
}

async function refreshReaders() {
  const sel = $('#id-reader')
  try {
    readers = await window.desktop.device.listReaders()
    console.log(readers)
  }
  catch (e) {
    sel.innerHTML = `<option value="">读卡器不可用（${esc(e.message)}）</option>`
    readers = []
    syncIdSections()
    return
  }
  if (!readers.length) {
    sel.innerHTML = '<option value="">未检测到读卡器</option>'
    syncIdSections()
    return
  }
  const prev = sel.value
  sel.innerHTML = readers.map(d =>
    `<option value="${esc(d.id)}">${esc(d.displayName)}（${esc(ID_TRANSPORT_LABEL[d.transport] ?? d.transport)}${d.status === 'ready' ? '' : ` · ${d.status === 'offline' ? '离线' : '不可用'}`}）</option>`).join('')
  sel.value = prev && readers.some(d => d.id === prev) ? prev : sel.options[0].value
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
    toast('未检测到可用读卡器', false)
    return
  }
  btn.disabled = true
  status.textContent = '读取中…'
  try {
    renderIdCard(await window.desktop.device.readIdCard({ deviceId }))
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

// ── IC 卡读取（Mifare：寻卡 → 防碰撞 → 选卡 → 认证 → 读块，与身份证共用设备串行锁） ──

async function readIcCard() {
  const btn = $('#btn-ic-read')
  const status = $('#ic-status')
  const deviceId = $('#id-reader').value
  if (!deviceId) {
    toast('未检测到可用读卡器', false)
    return
  }
  const key = $('#ic-key').value.trim()
  btn.disabled = true
  status.textContent = '读取中…'
  try {
    const r = await window.desktop.device.readIcCard({
      deviceId,
      sector: Number($('#ic-sector').value),
      key: key || undefined,
      keyType: $('#ic-keytype').value,
    })
    console.log({read: r})
    $('#ic-uid').textContent = r.uid
    $('#ic-number').textContent = r.cardNumber ?? '—'
    $('#ic-type').textContent = r.cardType ?? '—'
    $('#ic-blocks').innerHTML = Object.entries(r.blocks)
      .map(([addr, hex]) => {
        const text = toCString(hex)
        const textLabel = text === null ? '' : ` · 文本 "${esc(text)}"`
        return `<div>块 ${esc(addr)}：${esc(hex)}<br><span class="hint">ASCII ${esc(toPrintableAscii(hex))}${textLabel}</span></div>`
      }).join('')
    $('#ic-result').hidden = false
    status.textContent = '读取成功'
    toast('IC 卡读取成功')
  }
  catch (e) {
    status.textContent = `读取失败：${e.code ?? 'UNKNOWN'} · ${e.message ?? '未知错误'}`
    toast(status.textContent, false)
  }
  finally {
    btn.disabled = false
  }
}

$('#btn-ic-read').addEventListener('click', () => void readIcCard())

// ── IC 卡写入（单块覆盖写，驱动强制拒绝密钥控制块/厂商块；写后自动回读比对展示） ──

async function writeIcBlock() {
  const btn = $('#btn-ic-write')
  const status = $('#ic-status')
  const block = Number($('#ic-wblock').value)
  const data = $('#ic-wdata').value.trim().toUpperCase()
  const deviceId = $('#id-reader').value
  if (!deviceId) {
    toast('未检测到可用读卡器', false)
    return
  }
  if (!Number.isInteger(block) || block < 0 || block > 63) {
    toast('块地址应为 0-63', false)
    return
  }
  // 危险块与驱动同规则前置拦截：不合法不弹 confirm、不发 IPC
  if (block % 4 === 3) {
    toast(`块 ${block} 是密钥控制块，禁止写入`, false)
    return
  }
  if (block === 0) {
    toast('块 0 是厂商块（UID 区），禁止写入', false)
    return
  }
  if (!/^[0-9A-F]{32}$/.test(data)) {
    toast('数据应为 32 位 hex（16 字节）', false)
    return
  }
  if (!window.confirm(`确认写入块 ${block}？该操作覆盖原数据 16 字节、不可恢复。`)) {
    return
  }
  btn.disabled = true
  status.textContent = `写入块 ${block} 中…`
  try {
    await window.desktop.device.writeIcCard({
      deviceId,
      block,
      data,
      key: $('#ic-wkey').value.trim() || undefined,
      keyType: $('#ic-wkeytype').value,
    })
    status.textContent = `块 ${block} 写入成功`
    toast(`块 ${block} 写入成功`)
    // 写后回读验证（同一扇区密钥），结果展示在读取区
    $('#ic-sector').value = String(Math.floor(block / 4))
    $('#ic-key').value = $('#ic-wkey').value
    $('#ic-keytype').value = $('#ic-wkeytype').value
    await readIcCard()
  }
  catch (e) {
    status.textContent = `写入失败：${e.code ?? 'UNKNOWN'} · ${e.message ?? '未知错误'}`
    toast(status.textContent, false)
  }
  finally {
    btn.disabled = false
  }
}

$('#btn-ic-write').addEventListener('click', () => void writeIcBlock())

// ── IC 卡字符串组（扇区级业务语义：每行一个字符串，与 writeIcCardTexts / readIcCard 的 texts 契约同构） ──

/** 文本域 → 字符串组：按行拆分并丢弃行尾空白行（尾部空串写入即清零块，读取时不保留，无法往返） */
function parseTexts() {
  const texts = $('#ic-t-texts').value.replace(/\r/g, '').split('\n')
  while (texts.length > 0 && texts[texts.length - 1] === '') {
    texts.pop()
  }
  return texts
}

async function readIcTexts() {
  const btn = $('#btn-ic-t-read')
  const deviceId = $('#id-reader').value
  if (!deviceId) {
    toast('未检测到可用读卡器', false)
    return
  }
  const key = $('#ic-t-key').value.trim()
  btn.disabled = true
  try {
    const r = await window.desktop.device.readIcCard({
      deviceId,
      sector: Number($('#ic-t-sector').value),
      key: key || undefined,
      keyType: $('#ic-t-keytype').value,
    })
    const texts = r.texts

    console.log({texts})

    $('#ic-t-items').innerHTML = texts.length
      ? texts.map((text, i) => `<div>${i}: "${esc(text)}"</div>`).join('')
      : '<span class="hint">（空）</span>'
    $('#ic-t-result').hidden = false
    toast('字符串组读取成功')
  }
  catch (e) {
    $('#ic-t-result').hidden = true
    toast(`读取失败：${e.code ?? 'UNKNOWN'} · ${e.message ?? '未知错误'}`, false)
  }
  finally {
    btn.disabled = false
  }
}

async function writeIcTexts() {
  const btn = $('#btn-ic-t-write')
  const deviceId = $('#id-reader').value
  const texts = parseTexts()
  const sector = Number($('#ic-t-sector').value)
  if (!deviceId) {
    toast('未检测到可用读卡器', false)
    return
  }
  if (!Number.isInteger(sector) || sector < 1 || sector > 15) {
    toast('扇区应为 1-15（0 扇区首块为厂商块，不可写）', false)
    return
  }
  if (texts.length > 3) {
    toast('最多 3 行（每扇区 3 个数据块）', false)
    return
  }
  const tooLong = texts.find(text => new TextEncoder().encode(text).length > 16)
  if (tooLong !== undefined) {
    toast(`"${tooLong}" 超出单块容量（UTF-8 16 字节）`, false)
    return
  }
  if (!window.confirm(`确认写入扇区 ${sector}？整扇区覆盖（未占用块清零）、不可恢复。`)) {
    return
  }
  btn.disabled = true
  try {
    console.log({deviceId, sector, texts})
    await window.desktop.device.writeIcCardTexts({
      deviceId,
      sector,
      texts,
      key: $('#ic-t-key').value.trim() || undefined,
      keyType: $('#ic-t-keytype').value,
    })
    toast(`扇区 ${sector} 写入成功`)
    // 写后回读验证（同一扇区密钥），结果展示在字符串组区
    await readIcTexts()
  }
  catch (e) {
    toast(`写入失败：${e.code ?? 'UNKNOWN'} · ${e.message ?? '未知错误'}`, false)
  }
  finally {
    btn.disabled = false
  }
}

$('#btn-ic-t-read').addEventListener('click', () => void readIcTexts())
$('#btn-ic-t-write').addEventListener('click', () => void writeIcTexts())

// ── 清空：读卡结果（证件/IC）一次清掉，回到未读状态 ──

$('#btn-id-clear').addEventListener('click', () => {
  $('#id-result').hidden = true
  $('#id-photo').hidden = true
  $('#id-fields').innerHTML = ''
  $('#ic-result').hidden = true
  $('#ic-uid').textContent = ''
  $('#ic-number').textContent = ''
  $('#ic-type').textContent = ''
  $('#ic-blocks').innerHTML = ''
  $('#ic-t-result').hidden = true
  $('#ic-t-items').innerHTML = ''
  $('#id-status').textContent = '选择读卡器后点击读取'
  $('#ic-status').textContent = '选择读卡器后点击读取'
  toast('已清空读卡结果')
})

registerRefresher(refreshReaders)
void refreshReaders()

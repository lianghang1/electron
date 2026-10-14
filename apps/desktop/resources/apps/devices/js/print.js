'use strict'
/* 打印域：统一信封提交（8 种内容类型）+ 版式 + 小票硬件控制 + 渲染预览 + 打印机/任务管理 */

const KINDS = {
  receipt80: { templateId: 'receipt-default', sampleKey: 'receipt', paper: '80', paperWidth: 80, receipt: true },
  receipt58: { templateId: 'receipt-default', sampleKey: 'receipt', paper: '58', paperWidth: 58, receipt: true },
  document: { templateId: 'document-default', sampleKey: 'document', paper: 'a4', paperWidth: 210, docLike: true },
  label: { templateId: 'label-default', sampleKey: 'label', paper: '40x30', paperWidth: 40 },
  image: { payload: 'file', paper: 'a4', paperWidth: 210, docLike: true },
  pdf: { payload: 'file', paper: 'a4', paperWidth: 210, docLike: true },
  pdfurl: { payload: 'url', paper: 'a4', paperWidth: 210, docLike: true },
  html: { payload: 'html', paper: 'a4', paperWidth: 210, docLike: true },
}

const SAMPLES = {
  receipt: {
    shopName: '黑猫咖啡·旗舰店',
    shopSub: '客如云来 · 一饮而尽',
    orderNo: 'SO-20260925-001',
    time: '2026-09-25 10:30:00',
    cashier: '小王',
    items: [
      { name: '拿铁（大杯/热）', qty: 2, price: '28.00', amount: '56.00' },
      { name: '燕麦曲奇', qty: 1, price: '15.00', amount: '15.00' },
    ],
    total: '71.00',
    payMethod: '微信支付',
    qrData: 'https://example.com/order/SO-1',
    footer: '谢谢惠顾，欢迎再次光临',
  },
  label: { title: '仓库物料标签', code: 'SKU-2026-0925', spec: '500ml × 24', date: '2026-09-25' },
  document: {
    title: '技术服务合同',
    docNo: 'HT-2026-0925',
    paragraphs: [{ text: '甲方委托乙方进行桌面应用打印模块的技术开发工作，双方经友好协商达成以下条款。' }],
    partyA: '甲方科技有限公司',
    partyB: '乙方软件工作室',
    signDate: '2026年9月25日',
  },
}

let printers = []
let jobs = []
let currentKind = 'receipt80'

// ── 内容类型切换：联动数据区 / 版式 / 硬件控制 / 预览按钮 / 默认纸型 ──
function switchKind(k) {
  currentKind = k
  const kind = KINDS[k]
  document.querySelectorAll('.kind-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === k))
  $('#data-template').hidden = !kind.templateId
  $('#data-html').hidden = kind.payload !== 'html'
  $('#data-file').hidden = kind.payload !== 'file'
  $('#data-url').hidden = kind.payload !== 'url'
  $('#layout-grid').hidden = !kind.docLike
  $('#pdf-extra-grid').hidden = currentKind !== 'pdf' && currentKind !== 'pdfurl'
  $('#hardware-grid').hidden = !kind.receipt
  $('#btn-preview').hidden = !kind.templateId
  // 尽量选中宽度匹配的驱动表单（如 80mm 小票切到 80 宽纸型），匹配不上保持当前选择
  if (kind.paperWidth != null) {
    const hit = [...$('#opt-paper').options].find(o => !o.disabled && o.value.startsWith(`custom:${kind.paperWidth}x`))
    if (hit) $('#opt-paper').value = hit.value
  }
  syncPaperOptions()
  if (kind.templateId) loadSample()
}

function loadSample() {
  const kind = KINDS[currentKind]
  if (kind.sampleKey) $('#tpl-data').value = JSON.stringify(SAMPLES[kind.sampleKey], null, 2)
}

function markJsonValid() {
  try {
    JSON.parse($('#tpl-data').value)
    $('#tpl-data').style.borderColor = ''
  }
  catch {
    $('#tpl-data').style.borderColor = 'var(--err)'
  }
}

// ── 选项 → PrintRequest 组装 ──
function buildPayload() {
  const kind = KINDS[currentKind]
  if (kind.payload === 'file') {
    return { kind: 'file', path: $('#file-path').value.trim() }
  }
  if (kind.payload === 'url') {
    const fileType = $('#opt-file-type').value
    return { kind: 'url', url: $('#file-url').value.trim(), ...(fileType ? { fileType } : {}) }
  }
  if (kind.payload === 'html') {
    return { kind: 'html', html: $('#html-data').value }
  }
  return { kind: 'template', templateId: kind.templateId, data: JSON.parse($('#tpl-data').value) }
}

function buildMargin() {
  const choice = $('#opt-margin').value
  if (choice === 'none') return 'none'
  if (choice === 'custom') {
    return {
      topMm: Number($('#margin-top').value) || 0,
      rightMm: Number($('#margin-right').value) || 0,
      bottomMm: Number($('#margin-bottom').value) || 0,
      leftMm: Number($('#margin-left').value) || 0,
    }
  }
  return 'default'
}

function buildOptions() {
  const kind = KINDS[currentKind]
  const options = {
    paper: parsePaperValue($('#opt-paper').value) || kind.paper,
    copies: Math.max(1, Math.min(999, Number($('#opt-copies').value) || 1)),
    silent: $('#opt-silent').checked,
    grayscale: $('#opt-grayscale').checked,
    channel: $('#opt-channel').value,
    margin: buildMargin(),
    printerId: $('#opt-printer').value || undefined,
    jobName: document.querySelector(`.kind-btn[data-kind="${currentKind}"]`).textContent,
  }
  if (kind.docLike) {
    options.landscape = $('#opt-landscape').value === '1'
    options.duplex = $('#opt-duplex').value || undefined
    options.pages = $('#opt-pages').value.trim() || undefined
  }
  // PDF 文件直通专有（SumatraPDF -print-settings），其余类型不发送
  if (currentKind === 'pdf') {
    options.subset = $('#opt-subset').value || undefined
    options.scale = $('#opt-scale').value || undefined
    options.bin = $('#opt-bin').value.trim() || undefined
  }
  if (kind.receipt) {
    const cut = $('#hw-cut').value
    const feed = Number($('#hw-feed').value) || 0
    if (cut || feed > 0 || $('#hw-cashbox').checked) {
      options.hardware = {
        ...(cut ? { cut } : {}),
        ...(feed > 0 ? { feedLines: feed } : {}),
        ...($('#hw-cashbox').checked ? { openCashbox: true } : {}),
      }
    }
  }
  return options
}

async function submitPrint() {
  const kind = KINDS[currentKind]
  if (kind.templateId) {
    try {
      JSON.parse($('#tpl-data').value)
    }
    catch {
      toast('模板数据不是合法 JSON', false)
      return
    }
  }
  if (kind.payload === 'file' && !$('#file-path').value.trim()) {
    toast('请先填写文件绝对路径', false)
    return
  }
  if (kind.payload === 'url' && !$('#file-url').value.trim()) {
    toast('请先填写 PDF 链接', false)
    return
  }
  $('#print-result').textContent = '提交中…'
  try {
    const r = await window.desktop.print.submit({
      payload: buildPayload(),
      options: buildOptions(),
    })
    $('#print-result').textContent = `已提交：${r.jobId}（通道 ${r.channel}）`
    toast('已提交打印')
    void refreshJobs()
  }
  catch (e) {
    $('#print-result').textContent = `失败：${e.message ?? '未知错误'}`
    toast(`打印失败：${e.message ?? '未知错误'}`, false)
  }
}

async function renderPreview() {
  const kind = KINDS[currentKind]
  if (!kind.templateId) return
  let data
  try {
    data = JSON.parse($('#tpl-data').value)
  }
  catch {
    toast('模板数据不是合法 JSON', false)
    return
  }
  try {
    const html = await window.desktop.print.renderPreview(kind.templateId, data, parsePaperValue($('#opt-paper').value) || kind.paper)
    $('#preview-wrap').hidden = false
    $('#preview-frame').srcdoc = html
  }
  catch (e) {
    toast(`预览失败：${e.message}`, false)
  }
}

// ── 打印机列表（含能力标注）+ 下拉 ──
/** 驱动默认值摘要（打印首选项 DEVMODE / CUPS 默认选项），无数据返回空串 */
function defaultsText(d) {
  if (!d) return ''
  const parts = []
  if (d.formName) parts.push(`默认纸型 ${d.formName}`)
  if (d.orientation === 'landscape') parts.push('横向')
  if (d.duplex === 'duplexlong') parts.push('默认双面（长边）')
  else if (d.duplex === 'duplexshort') parts.push('默认双面（短边）')
  if (d.color != null) parts.push(d.color ? '彩色' : '黑白')
  if (d.copies > 1) parts.push(`默认 ${d.copies} 份`)
  return parts.join(' / ')
}

function renderPrinters() {
  $('#printer-count').textContent = printers.length ? `共 ${printers.length} 台` : ''
  const box = $('#printer-list')
  if (!printers.length) {
    box.innerHTML = '<div class="empty">未检测到打印机（网络直连打印机由宿主 bootstrap.devices 配置注入）</div>'
    return
  }
  box.innerHTML = printers.map((p) => {
    const st = p.status === 'ready' ? '<span class="badge ok"><span class="dot"></span>已就绪</span>'
      : p.status === 'offline' ? '<span class="badge err"><span class="dot"></span>离线</span>'
        : '<span class="badge"><span class="dot"></span>状态未知</span>'
    const caps = [
      p.capabilities?.cut ? '切刀' : '',
      p.capabilities?.openCashbox ? '钱箱' : '',
      p.capabilities?.paperList?.length ? `纸型 ${p.capabilities.paperList.length}` : '',
      defaultsText(p.capabilities?.defaults),
      p.capabilities?.duplexSupported ? '支持双面' : '',
      p.capabilities?.colorSupported ? '支持彩色' : '',
    ].filter(Boolean).join(' · ')
    return `<div class="row">
      <div class="grow">
        <div class="name">${esc(p.displayName)}${p.isDefault ? ' <span class="chip brand">默认</span>' : ''}</div>
        <div class="sub">${esc(SOURCE_LABEL[p.source] ?? p.source)} · ${esc(p.id)}${caps ? ` · ${esc(caps)}` : ''}</div>
      </div>
      ${st}
      <button class="btn" data-print="${esc(p.id)}">测试页</button>
    </div>`
  }).join('')

  const sel = $('#opt-printer')
  const prev = sel.value
  sel.innerHTML = '<option value="">系统默认打印机</option>' + printers.map(p =>
    `<option value="${esc(p.id)}">${esc(p.displayName)}${p.isDefault ? '（默认）' : ''}${p.status === 'offline' ? ' · 离线' : ''}</option>`).join('')
  if (prev && printers.some(p => p.id === prev)) sel.value = prev
}

async function refreshPrinters() {
  try {
    printers = await window.desktop.print.listPrinters()
    console.log(printers)
  }
  catch (e) {
    toast(`读取打印机失败：${e.message}`, false)
  }
  renderPrinters()
  syncPaperOptions()
}

// ── 纸型下拉随打印机联动：仅驱动上报纸型（原名原样），查询失败显式提示、绝不回落伪装数据 ──
function paperSizeText(f) {
  if (!f.widthMm) return ''
  return `${f.widthMm}×${f.heightMm ? `${f.heightMm}mm` : '连续'}`
}

function optionsHtml(label, opts) {
  const body = opts.map(o =>
    `<option value="${esc(o.value)}"${o.disabled ? ' disabled' : ''}>${esc(o.label)}</option>`).join('')
  return `<optgroup label="${esc(label)}">${body || '<option value="" disabled>（空）</option>'}</optgroup>`
}

/** 驱动表单组：名字原样展示；无尺寸表单无法换算提交参数（按尺寸送打），置灰 */
function driverFormOptions(forms) {
  return forms.map((f) => {
    const size = paperSizeText(f)
    if (!size) return { value: '', label: `${f.name}（驱动未上报尺寸）`, disabled: true }
    return { value: `custom:${f.widthMm}x${f.heightMm || 0}`, label: `${f.name}（${size}）` }
  })
}

function syncPaperOptions() {
  const sel = $('#opt-paper')
  const prev = sel.value
  const selected = printers.find(x => x.id === $('#opt-printer').value)
  const forms = selected?.capabilities?.paperList ?? []
  const opts = forms.length
    ? driverFormOptions(forms)
    : [{ value: '', label: selected ? '未读取到该打印机的纸型数据' : '先选择打印机', disabled: true }]
  sel.innerHTML = optionsHtml('打印机纸型（驱动上报）', opts)
  if (opts.some(o => o.value === prev && !o.disabled)) sel.value = prev
}

// 下拉值 → paper 入参：驱动表单尺寸转为 '宽x高' 写法（高 0 = 连续纸）
function parsePaperValue(v) {
  if (!v) return null
  const m = v.match(/^custom:(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/)
  if (m) return `${m[1]}x${m[2]}`
  return v
}

// ── 打印任务 ──
function renderJobs() {
  const box = $('#job-list')
  if (!jobs.length) {
    box.innerHTML = '<div class="empty">暂无打印任务</div>'
    return
  }
  box.innerHTML = jobs.map((j) => {
    const tone = j.state === 'done' ? 'ok' : j.state === 'failed' ? 'err' : ''
    const st = `<span class="badge ${tone}"><span class="dot"></span>${STATE_LABEL[j.state] ?? j.state}</span>`
    const err = j.state === 'failed' && j.error?.message ? ` · ${esc(j.error.message)}` : ''
    return `<div class="row">
      <div class="grow">
        <div class="name">${esc(j.jobName ?? j.jobId)}</div>
        <div class="sub">${esc(j.result?.printerId ?? '—')} · ${fmtTime(j.createdAt)}${err}</div>
      </div>
      ${st}
      <button class="btn ghost" data-reprint="${esc(j.jobId)}">重打</button>
      <button class="btn danger-ghost" data-remove="${esc(j.jobId)}">删除</button>
    </div>`
  }).join('')
}

async function refreshJobs() {
  try {
    jobs = await window.desktop.print.listJobs(100)
  }
  catch (e) {
    toast(`读取任务失败：${e.message}`, false)
  }
  renderJobs()
}

// ── 事件绑定 ──
$('#kind-grid').addEventListener('click', (e) => {
  const k = e.target.dataset?.kind
  if (k) switchKind(k)
})
$('#btn-load-sample').addEventListener('click', loadSample)
$('#tpl-data').addEventListener('input', markJsonValid)
$('#opt-margin').addEventListener('change', () => {
  $('#margin-custom').hidden = $('#opt-margin').value !== 'custom'
})
$('#opt-printer').addEventListener('change', syncPaperOptions)
$('#opt-silent').addEventListener('change', () => {
  $('#silent-warn').hidden = $('#opt-silent').checked
})
$('#btn-print').addEventListener('click', () => void submitPrint())
$('#btn-preview').addEventListener('click', () => void renderPreview())

$('#printer-list').addEventListener('click', async (e) => {
  const id = e.target.dataset?.print
  if (!id) return
  const p = printers.find(x => x.id === id)
  if (!p) return
  try {
    const r = await window.desktop.print.submit({
      payload: {
        kind: 'template',
        templateId: 'document-default',
        data: {
          title: '打印机测试页',
          docNo: `TEST-${Date.now().toString(36).toUpperCase()}`,
          partyA: 'DeviceHub 统一外设服务',
          partyB: p.displayName,
          signDate: new Date().toLocaleDateString(),
          paragraphs: [
            { text: `本页用于验证打印机「${p.displayName}」的通道与纸张设置。` },
            { text: '内容完整清晰即表示设备工作正常。' },
          ],
        },
      },
      options: { paper: 'a4', copies: 1, silent: true, printerId: p.id, jobName: `测试页 · ${p.displayName}` },
    })
    toast(`已提交到 ${p.displayName}`)
    void refreshJobs()
  }
  catch (err) {
    toast(`提交失败：${err.message ?? '未知错误'}`, false)
  }
})

$('#job-list').addEventListener('click', async (e) => {
  const reprintId = e.target.dataset?.reprint
  const removeId = e.target.dataset?.remove
  if (reprintId) {
    try {
      await window.desktop.print.reprint(reprintId)
      toast('已重新提交打印')
      void refreshJobs()
    }
    catch (err) { toast(`重试失败：${err.message ?? '未知错误'}`, false) }
  }
  else if (removeId) {
    if (!window.confirm('删除该任务记录？记录与归档 PDF 将一并删除，不可恢复。')) return
    if (await window.desktop.print.removeJob(removeId)) {
      toast('任务记录已删除')
      void refreshJobs()
    }
  }
})

$('#btn-clear-jobs').addEventListener('click', async () => {
  if (!jobs.length) return
  if (!window.confirm(`清空全部 ${jobs.length} 条任务记录？归档 PDF 将一并删除，不可恢复。`)) return
  try {
    const n = await window.desktop.print.clearJobs()
    toast(`已清空 ${n} 条任务记录`)
    void refreshJobs()
  }
  catch (e) { toast(e.message, false) }
})

// ── 初始化 ──
registerRefresher(refreshPrinters)
registerRefresher(refreshJobs)
void (async () => {
  await refreshPrinters()
  switchKind('receipt80')
  await refreshJobs()
})()

// ── 网络直连打印机档案：运行时添加/编辑（upsert 持久化 + 即时生效）；新档案 id 按 raw:host:port 统一约定 ──

const NETP_PROTOCOL_LABEL = { escpos: 'ESC/POS', star: 'Star' }

let netPrinters = []
let editingNetPrinter = null

function renderNetPrinters() {
  const box = $('#netp-list')
  if (!netPrinters.length) {
    box.innerHTML = '<div class="empty">暂无网络直连打印机档案，点右上「添加」创建</div>'
    return
  }
  box.innerHTML = netPrinters.map((p) => {
    const addr = p.mock ? '落盘模拟' : `${p.transport.host}:${p.transport.port}`
    return `<div class="row">
      <div class="grow">
        <div class="name">${esc(p.displayName || p.id)}${p.isDefault ? ' <span class="chip brand">默认</span>' : ''}</div>
        <div class="sub">${esc(NETP_PROTOCOL_LABEL[p.protocol] ?? p.protocol)} · ${esc(addr)} · ${esc(p.id)}</div>
      </div>
      ${p.mock ? '<span class="chip">模拟</span>' : ''}
      <button class="btn ghost" data-netp-edit="${esc(p.id)}">编辑</button>
    </div>`
  }).join('')
}

async function refreshNetPrinters() {
  try {
    netPrinters = await window.desktop.print.getNetworkPrinters()
  }
  catch (e) {
    toast(`读取打印机档案失败：${e.message}`, false)
    netPrinters = []
  }
  renderNetPrinters()
}

function openNetPrinterForm(p) {
  editingNetPrinter = p ?? null
  $('#netp-name').value = p?.displayName ?? ''
  $('#netp-host').value = p?.transport?.host ?? ''
  $('#netp-port').value = p?.transport?.port ?? 9100
  $('#netp-protocol').value = p?.protocol ?? 'escpos'
  $('#netp-mock').checked = !!p?.mock
  $('#netp-default').checked = !!p?.isDefault
  $('#netp-form-note').textContent = p ? `正在编辑「${p.displayName || p.id}」，id 保持不变` : '新档案，id 按地址生成'
  $('#netp-form').hidden = false
}

function closeNetPrinterForm() {
  editingNetPrinter = null
  $('#netp-form').hidden = true
}

$('#btn-netp-add').addEventListener('click', () => openNetPrinterForm(null))
$('#btn-netp-cancel').addEventListener('click', closeNetPrinterForm)

$('#netp-list').addEventListener('click', (e) => {
  const id = e.target.dataset?.netpEdit
  if (!id) return
  const p = netPrinters.find(x => x.id === id)
  if (p) openNetPrinterForm(p)
})

$('#btn-netp-save').addEventListener('click', async () => {
  const name = $('#netp-name').value.trim()
  const host = $('#netp-host').value.trim()
  const port = Number($('#netp-port').value)
  if (!name) { toast('请填写打印机名称', false); return }
  if (!host) { toast('请填写主机地址', false); return }
  if (!Number.isInteger(port) || port < 1 || port > 65535) { toast('端口应为 1-65535 的整数', false); return }
  const printer = {
    ...(editingNetPrinter ?? {}),
    id: editingNetPrinter?.id ?? `raw:${host}:${port}`,
    displayName: name,
    protocol: $('#netp-protocol').value,
    transport: { type: 'tcp', host, port },
    mock: $('#netp-mock').checked,
    isDefault: $('#netp-default').checked || undefined,
  }
  try {
    netPrinters = await window.desktop.print.upsertNetworkPrinter(printer)
    renderNetPrinters()
    closeNetPrinterForm()
    toast('打印机档案已保存')
    await refreshPrinters()
  }
  catch (e) { toast(e.message, false) }
})

registerRefresher(refreshNetPrinters)
void refreshNetPrinters()

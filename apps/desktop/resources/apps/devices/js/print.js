'use strict'
/* 打印域：统一信封提交（图片/PDF/链接/HTML 四种内容）+ 版式选项 + 打印机/任务管理 */

const KINDS = {
  image: { payload: 'file', paper: 'a4', paperWidth: 210, docLike: true },
  pdf: { payload: 'file', paper: 'a4', paperWidth: 210, docLike: true },
  pdfurl: { payload: 'url', paper: 'a4', paperWidth: 210, docLike: true },
  html: { payload: 'html', paper: 'a4', paperWidth: 210, docLike: true },
}

let printers = []
let jobs = []
let currentKind = 'image'

// ── 内容类型切换：联动数据区 / 版式 / 默认纸型 ──
function switchKind(k) {
  currentKind = k
  const kind = KINDS[k]
  document.querySelectorAll('.kind-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === k))
  $('#data-html').hidden = kind.payload !== 'html'
  $('#data-file').hidden = kind.payload !== 'file'
  $('#data-url').hidden = kind.payload !== 'url'
  $('#layout-grid').hidden = !kind.docLike
  $('#pdf-extra-grid').hidden = currentKind !== 'pdf' && currentKind !== 'pdfurl'
  // 尽量选中宽度匹配的驱动表单（如 80mm 小票切到 80 宽纸型），匹配不上保持当前选择
  if (kind.paperWidth != null) {
    const hit = [...$('#opt-paper').options].find(o => !o.disabled && o.value.startsWith(`custom:${kind.paperWidth}x`))
    if (hit) $('#opt-paper').value = hit.value
  }
  syncPaperOptions()
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
  return { kind: 'html', html: $('#html-data').value }
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
  return options
}

async function submitPrint() {
  const kind = KINDS[currentKind]
  if (kind.payload === 'file' && !$('#file-path').value.trim()) {
    toast('请先填写文件绝对路径', false)
    return
  }
  if (kind.payload === 'url' && !$('#file-url').value.trim()) {
    toast('请先填写 PDF 链接', false)
    return
  }
  if (kind.payload === 'html' && !$('#html-data').value.trim()) {
    toast('请先填写 HTML 内容', false)
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
    box.innerHTML = '<div class="empty">未检测到打印机</div>'
    return
  }
  box.innerHTML = printers.map((p) => {
    const st = p.status === 'ready' ? '<span class="badge ok"><span class="dot"></span>已就绪</span>'
      : p.status === 'offline' ? '<span class="badge err"><span class="dot"></span>离线</span>'
        : '<span class="badge"><span class="dot"></span>状态未知</span>'
    const caps = [
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
$('#opt-margin').addEventListener('change', () => {
  $('#margin-custom').hidden = $('#opt-margin').value !== 'custom'
})
$('#opt-printer').addEventListener('change', syncPaperOptions)
$('#opt-silent').addEventListener('change', () => {
  $('#silent-warn').hidden = $('#opt-silent').checked
})
$('#btn-print').addEventListener('click', () => void submitPrint())

$('#printer-list').addEventListener('click', async (e) => {
  const id = e.target.dataset?.print
  if (!id) return
  const p = printers.find(x => x.id === id)
  if (!p) return
  try {
    const r = await window.desktop.print.submit({
      payload: {
        kind: 'html',
        html: buildTestPageHtml({
          printerName: p.displayName,
          docNo: `TEST-${Date.now().toString(36).toUpperCase()}`,
          date: new Date().toLocaleString(),
        }),
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

// ── 测试页 HTML（原模板通道删除后改为内联静态页）──
function buildTestPageHtml({ printerName, docNo, date }) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c])
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: "Microsoft YaHei", sans-serif; margin: 48px; color: #222; }
    h1 { font-size: 22px; margin: 0 0 4px; } .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { border: 1px solid #ccc; padding: 8px 10px; } .swatch { height: 34px; }
  </style></head><body>
    <h1>打印机测试页</h1>
    <div class="meta">编号 ${esc(docNo)} · 目标 ${esc(printerName)} · ${esc(date)}</div>
    <table>
      <tr><td style="width:30%">黑白文本</td><td>内容完整清晰即表示通道与纸张设置正常。</td></tr>
      <tr><td>灰阶色块</td><td class="swatch" style="background:linear-gradient(90deg,#000,#fff)"></td></tr>
      <tr><td>彩色色块</td><td class="swatch" style="background:linear-gradient(90deg,#e33,#3a5,#36c)"></td></tr>
    </table>
  </body></html>`
}

// ── 初始化 ──
registerRefresher(refreshPrinters)
registerRefresher(refreshJobs)
void (async () => {
  await refreshPrinters()
  switchKind('image')
  await refreshJobs()
})()


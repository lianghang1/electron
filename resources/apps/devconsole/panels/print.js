import { computed, defineComponent, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { call } from '../js/jsapi.js'
import { toast } from '../js/toast.js'
import { fmtTime, registerRefresher } from '../js/store.js'

/**
 * 打印：统一信封提交（图片/PDF 文件/PDF 链接/HTML 四类负载）+ 打印机能力列表与测试页 + 任务簿。
 * 切换内容类型时按纸宽自动匹配驱动表单（如小票 80mm 切 80 宽纸型），纸型只随驱动上报联动、不回落伪装数据。
 */

const KINDS = [
  { id: 'image', label: '图片文件', payload: 'file', paperWidth: 210 },
  { id: 'pdf', label: 'PDF 文件', payload: 'file', paperWidth: 210 },
  { id: 'pdfurl', label: 'PDF 链接', payload: 'url', paperWidth: 210 },
  { id: 'html', label: 'HTML', payload: 'html', paperWidth: 210 },
]

const DEFAULT_TEST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { font-family: "Microsoft YaHei", sans-serif; margin: 48px; color: #222; }
h1 { font-size: 22px; margin: 0 0 4px; } .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
td { border: 1px solid #ccc; padding: 8px 10px; } .swatch { height: 34px; }
</style></head><body>
<h1>开发者控制台测试页</h1>
<div class="meta">devconsole submitPrintJob · HTML 负载</div>
<table>
<tr><td style="width:30%">黑白文本</td><td>内容完整清晰即表示通道与纸张设置正常。</td></tr>
<tr><td>灰阶色块</td><td class="swatch" style="background:linear-gradient(90deg,#000,#fff)"></td></tr>
<tr><td>彩色色块</td><td class="swatch" style="background:linear-gradient(90deg,#e33,#3a5,#36c)"></td></tr>
</table>
</body></html>`

const CHANNELS = ['auto', 'system', 'ipp', 'simulated', 'preview', 'dry-run']
const SOURCE_LABEL = { system: '系统打印机', ipp: 'IPP', simulated: '模拟通道' }
const PRINTER_STATE = { ready: '已就绪', offline: '离线' }
const STATE_TONE = { done: 'ok', failed: 'err' }
const STATE_LABEL = { accepted: '已受理', printing: '打印中', done: '已完成', failed: '失败' }

export default defineComponent({
  name: 'PrintPanel',
  setup() {
    const printers = ref([])
    const jobs = ref([])
    const loaded = ref(false)
    const result = ref('')
    const resultOk = ref(true)
    const submitting = ref(false)

    const form = reactive({
      kind: 'image',
      html: DEFAULT_TEST_HTML,
      url: '',
      fileType: '',
      path: '',
      printerId: '',
      paper: '',
      copies: 1,
      silent: true,
      grayscale: false,
      channel: 'auto',
      landscape: '',
      duplex: '',
      pages: '',
      margin: '',
      marginTop: 10,
      marginRight: 10,
      marginBottom: 10,
      marginLeft: 10,
      jobName: '',
      subset: '',
      scale: '',
      bin: '',
      rasterizeEnabled: false,
      rasterizeDpi: 300,
      rasterizeFormat: 'png',
    })

    const activeKind = computed(() => KINDS.find(k => k.id === form.kind))
    const selectedPrinter = computed(() => printers.value.find(p => p.id === form.printerId))

    /** 驱动上报纸型 → 下拉项：无尺寸表单无法换算提交参数，置灰；custom: 前缀提交时转 '宽x高'；无数据给占位项显式说明 */
    const paperOptions = computed(() => {
      const forms = selectedPrinter.value?.capabilities?.paperList ?? []
      if (!forms.length) {
        return [{ value: '', label: selectedPrinter.value ? '未读取到该打印机的纸型数据' : '先选择打印机', disabled: true }]
      }
      return forms.map((f) => {
        const size = f.widthMm ? `${f.widthMm}×${f.heightMm ? `${f.heightMm}mm` : '连续'}` : ''
        return {
          value: f.widthMm ? `custom:${f.widthMm}x${f.heightMm || 0}` : '',
          label: size ? `${f.name}（${size}）` : `${f.name}（驱动未上报尺寸）`,
          disabled: !f.widthMm,
        }
      })
    })

    // 打印机切换/刷新后保留仍有效的纸型选中项，失效则清空（提交时回落 a4）
    watch(paperOptions, (opts) => {
      if (form.paper && !opts.some(o => o.value === form.paper && !o.disabled)) { form.paper = '' }
    })

    function capsText(p) {
      const caps = [
        p.capabilities?.paperList?.length ? `纸型 ${p.capabilities.paperList.length}` : '',
        defaultsTextOf(p),
        p.capabilities?.duplexSupported ? '支持双面' : '',
        p.capabilities?.colorSupported ? '支持彩色' : '',
      ].filter(Boolean).join(' · ')
      return caps
    }
    function defaultsTextOf(p) {
      const d = p.capabilities?.defaults
      if (!d) { return '' }
      const parts = []
      if (d.formName) { parts.push(`默认纸型 ${d.formName}`) }
      if (d.orientation === 'landscape') { parts.push('横向') }
      if (d.duplex === 'duplexlong') { parts.push('默认双面（长边）') }
      else if (d.duplex === 'duplexshort') { parts.push('默认双面（短边）') }
      if (d.color != null) { parts.push(d.color ? '彩色' : '黑白') }
      if (d.copies > 1) { parts.push(`默认 ${d.copies} 份`) }
      return parts.join(' / ')
    }

    function printerTone(p) {
      return p.status === 'ready' ? 'ok' : p.status === 'offline' ? 'err' : ''
    }

    /** 切换内容类型：数据区随 payload 显隐；尽量选中宽度匹配的驱动表单，匹配不上保持当前选择 */
    function switchKind(id) {
      form.kind = id
      const width = activeKind.value?.paperWidth
      if (width != null) {
        const hit = paperOptions.value.find(o => !o.disabled && o.value.startsWith(`custom:${width}x`))
        if (hit) { form.paper = hit.value }
      }
    }

    async function loadPrinters() {
      try {
        printers.value = /** @type {any[]} */ (await call('print.listDevices'))
        // 选中项失效（离线拔除）时回系统默认
        if (form.printerId && !printers.value.some(p => p.id === form.printerId)) { form.printerId = '' }
        loaded.value = true
      }
      catch (e) {
        toast(`读取打印机失败：${e.message ?? String(e)}`, false)
      }
    }

    async function loadJobs() {
      try {
        jobs.value = /** @type {any[]} */ (await call('print.listPrintJobs', { maxCount: 100 }))
      }
      catch (e) {
        toast(`读取任务失败：${e.message ?? String(e)}`, false)
      }
    }

    const unregisterPrinters = registerRefresher(loadPrinters)
    const unregisterJobs = registerRefresher(loadJobs)
    onMounted(async () => {
      await loadPrinters()
      switchKind(form.kind)
      await loadJobs()
    })
    onUnmounted(() => {
      unregisterPrinters()
      unregisterJobs()
    })

    /** custom:宽x高 → '宽x高'（高 0 = 连续纸），其余原样 */
    function parsePaper(v) {
      const m = /^custom:(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(v ?? '')
      return m ? `${m[1]}x${m[2]}` : (v || 'a4')
    }

    function buildContent() {
      if (form.kind === 'html') { return { kind: 'html', html: form.html } }
      if (form.kind === 'pdfurl') {
        return { kind: 'url', url: form.url.trim(), ...(form.fileType ? { fileType: form.fileType } : {}) }
      }
      return { kind: 'file', path: form.path.trim() }
    }

    function buildMargin() {
      if (form.margin === 'none') { return 'none' }
      if (form.margin === 'custom') {
        return {
          topMm: Number(form.marginTop) || 0,
          rightMm: Number(form.marginRight) || 0,
          bottomMm: Number(form.marginBottom) || 0,
          leftMm: Number(form.marginLeft) || 0,
        }
      }
      return 'default'
    }

    function buildOptions() {
      const kind = activeKind.value
      const options = {
        paper: parsePaper(form.paper) || kind?.paper || 'a4',
        copies: Math.max(1, Math.min(999, Number(form.copies) || 1)),
        silent: form.silent,
        grayscale: form.grayscale,
        channel: form.channel,
        margin: buildMargin(),
        printerId: form.printerId || undefined,
        jobName: form.jobName.trim() || kind?.label,
      }
      options.landscape = form.landscape === '1'
      options.duplex = form.duplex || undefined
      options.pages = form.pages.trim() || undefined
      // PDF 文件直通专有（SumatraPDF -print-settings）：其余类型不发送
      if (form.kind === 'pdf') {
        options.subset = form.subset || undefined
        options.scale = form.scale || undefined
        options.bin = form.bin.trim() || undefined
      }
      // PDF 栅格化（防丢字，file/url 负载生效）：开启后先渲染为图像再重建 PDF
      if ((form.kind === 'pdf' || form.kind === 'pdfurl') && form.rasterizeEnabled) {
        options.rasterize = {
          dpi: Math.max(72, Math.min(1200, Math.round(Number(form.rasterizeDpi) || 300))),
          outputFormat: form.rasterizeFormat,
        }
      }
      return options
    }

    async function submitPrint() {
      const kind = activeKind.value
      if (kind?.payload === 'file' && !form.path.trim()) { toast('请先填写文件绝对路径', false); return }
      if (kind?.payload === 'url' && !form.url.trim()) { toast('请先填写 PDF 链接', false); return }
      if (kind?.payload === 'html' && !form.html.trim()) { toast('请先填写 HTML 内容', false); return }
      submitting.value = true
      result.value = '提交中…'
      resultOk.value = true
      try {
        const r = /** @type {{ jobId: string, channel: string, printerId: string }} */ (await call('print.submitPrintJob', { printContent: buildContent(), printOptions: buildOptions() }))
        result.value = `已提交：${r.jobId}（通道 ${r.channel} → ${r.printerId}）`
        toast('已提交打印')
        await loadJobs()
      }
      catch (e) {
        result.value = `失败：${e.message ?? '未知错误'}`
        resultOk.value = false
        toast(`打印失败：${e.message ?? '未知错误'}`, false)
      }
      finally {
        submitting.value = false
      }
    }

    /** 测试页：内联静态 HTML 真实提交（编号 + 时间戳每次不同，便于核对落纸） */
    async function submitTestPage(printer) {
      const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c])
      const html = DEFAULT_TEST_HTML.replace(
        '<div class="meta">devconsole submitPrintJob · HTML 负载</div>',
        `<div class="meta">编号 TEST-${Date.now().toString(36).toUpperCase()} · 目标 ${esc(printer.displayName)} · ${new Date().toLocaleString()}</div>`,
      )
      try {
        await call('print.submitPrintJob', {
          printContent: { kind: 'html', html },
          printOptions: { paper: 'a4', copies: 1, silent: true, printerId: printer.id, jobName: `测试页 · ${printer.displayName}` },
        })
        toast(`已提交到 ${printer.displayName}`)
        await loadJobs()
      }
      catch (e) {
        toast(`提交失败：${e.message ?? '未知错误'}`, false)
      }
    }

    async function reprint(job) {
      try {
        await call('print.reprintJob', { printJobId: job.jobId })
        toast('已重新提交打印')
        await loadJobs()
      }
      catch (e) { toast(`重试失败：${e.message ?? '未知错误'}`, false) }
    }

    async function removeJob(job) {
      if (!window.confirm('删除该任务记录？记录与归档 PDF 将一并删除，不可恢复。')) { return }
      const ok = /** @type {boolean} */ (await call('print.removePrintJob', { printJobId: job.jobId }))
      if (ok) {
        toast('任务记录已删除')
        await loadJobs()
      }
    }

    async function clearJobs() {
      if (!jobs.value.length) { return }
      if (!window.confirm(`清空全部 ${jobs.value.length} 条任务记录？归档 PDF 将一并删除，不可恢复。`)) { return }
      try {
        const n = /** @type {number} */ (await call('print.clearPrintJobs'))
        toast(`已清空 ${n} 条任务记录`)
        await loadJobs()
      }
      catch (e) { toast(e.message ?? String(e), false) }
    }

    return {
      KINDS, CHANNELS, SOURCE_LABEL, PRINTER_STATE, STATE_TONE, STATE_LABEL,
      printers, jobs, loaded, result, resultOk, submitting, form,
      activeKind, selectedPrinter, paperOptions, capsText, printerTone,
      switchKind, loadPrinters, loadJobs, submitPrint, submitTestPage, reprint, removeJob, clearJobs,
      fmtTime,
    }
  },
})

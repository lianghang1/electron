import { computed, defineComponent, onMounted, reactive, ref } from 'vue'
import { call } from '../js/jsapi.js'

/**
 * 打印：统一信封提交（html / url / file 三种负载）+ 全量版式选项 + 打印机能力列表与真实测试页 + 任务簿。
 * 纸型下拉随所选打印机驱动上报联动（custom:宽x高 → paper '宽x高'），查询失败显式提示、不回落伪装数据。
 */

const KINDS = [
  { id: 'html', label: 'HTML 内容', payload: 'html' },
  { id: 'url', label: 'PDF/图片链接', payload: 'url' },
  { id: 'file', label: '本地文件', payload: 'file' },
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
const DUPLEX = ['simplex', 'duplex', 'duplexshort', 'duplexlong']
const STATE_TONE = { done: 'ok', failed: 'err' }
const STATE_LABEL = { accepted: '已受理', printing: '打印中', done: '完成', failed: '失败' }

export default defineComponent({
  name: 'PrintPanel',
  setup() {
    const printers = ref([])
    const jobs = ref([])
    const loaded = ref(false)
    const result = ref('')
    const submitting = ref(false)

    const form = reactive({
      kind: 'html',
      html: DEFAULT_TEST_HTML,
      url: '',
      fileType: '',
      path: '',
      printerId: '',
      paper: '',
      copies: 1,
      silent: true,
      grayscale: false,
      channel: '',
      landscape: false,
      duplex: '',
      pages: '',
      margin: 'default',
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      jobName: '',
      subset: '',
      scale: '',
      bin: '',
    })

    const selectedPrinter = computed(() => printers.value.find(p => p.id === form.printerId))

    /** 驱动上报纸型 → 下拉项：无尺寸表单无法换算提交参数，置灰；custom: 前缀提交时转 '宽x高' */
    const paperOptions = computed(() => {
      const forms = selectedPrinter.value?.capabilities?.paperList ?? []
      return forms.map((f) => {
        const size = f.widthMm ? `${f.widthMm}×${f.heightMm ? `${f.heightMm}mm` : '连续'}` : ''
        return {
          value: f.widthMm ? `custom:${f.widthMm}x${f.heightMm || 0}` : '',
          label: size ? `${f.name}（${size}）` : `${f.name}（驱动未上报尺寸）`,
          disabled: !f.widthMm,
        }
      })
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

    async function loadPrinters() {
      printers.value = /** @type {any[]} */ (await call('print.listDevices'))
      // 选中项失效（离线拔除）时回系统默认
      if (form.printerId && !printers.value.some(p => p.id === form.printerId)) { form.printerId = '' }
      loaded.value = true
    }

    async function loadJobs() {
      jobs.value = /** @type {any[]} */ (await call('print.listPrintJobs', { maxCount: 100 }))
    }

    onMounted(() => {
      void loadPrinters()
      void loadJobs()
    })

    /** custom:宽x高 → '宽x高'（高 0 = 连续纸），其余原样 */
    function parsePaper(v) {
      const m = /^custom:(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(v ?? '')
      return m ? `${m[1]}x${m[2]}` : (v || 'a4')
    }

    function buildContent() {
      if (form.kind === 'html') { return { kind: 'html', html: form.html } }
      if (form.kind === 'url') {
        return { kind: 'url', url: form.url.trim(), ...(form.fileType ? { fileType: form.fileType } : {}) }
      }
      return { kind: 'file', path: form.path.trim() }
    }

    function buildOptions() {
      const options = {
        paper: parsePaper(form.paper),
        copies: Math.max(1, Math.min(999, Number(form.copies) || 1)),
        silent: form.silent,
        grayscale: form.grayscale,
        jobName: form.jobName.trim() || KINDS.find(k => k.id === form.kind)?.label,
      }
      if (form.printerId) { options.printerId = form.printerId }
      if (form.channel) { options.channel = form.channel }
      if (form.margin === 'none') { options.margin = 'none' }
      else if (form.margin === 'custom') {
        options.margin = {
          topMm: Number(form.marginTop) || 0,
          rightMm: Number(form.marginRight) || 0,
          bottomMm: Number(form.marginBottom) || 0,
          leftMm: Number(form.marginLeft) || 0,
        }
      }
      if (form.landscape) { options.landscape = true }
      if (form.duplex) { options.duplex = form.duplex }
      if (form.pages.trim()) { options.pages = form.pages.trim() }
      // PDF 直通专有（SumatraPDF/CUPS）：非 PDF 负载不发送
      const pdfDirect = form.kind === 'file' || (form.kind === 'url' && form.fileType === 'pdf')
      if (pdfDirect) {
        if (form.subset) { options.subset = form.subset }
        if (form.scale) { options.scale = form.scale }
        if (form.bin.trim()) { options.bin = form.bin.trim() }
      }
      return options
    }

    async function submitPrint() {
      if (form.kind === 'html' && !form.html.trim()) { result.value = '请先填写 HTML 内容'; return }
      if (form.kind === 'url' && !form.url.trim()) { result.value = '请先填写链接'; return }
      if (form.kind === 'file' && !form.path.trim()) { result.value = '请先填写文件绝对路径'; return }
      submitting.value = true
      result.value = '提交中…'
      try {
        const r = /** @type {{ jobId: string, channel: string, printerId: string }} */ (await call('print.submitPrintJob', { printContent: buildContent(), printOptions: buildOptions() }))
        result.value = `已提交：${r.jobId}（通道 ${r.channel} → ${r.printerId}）`
        await loadJobs()
      }
      catch (e) {
        result.value = `失败：[${e.code}] ${e.message}`
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
        const r = /** @type {{ jobId: string }} */ (await call('print.submitPrintJob', {
          printContent: { kind: 'html', html },
          printOptions: { paper: 'a4', copies: 1, silent: true, printerId: printer.id, jobName: `测试页 · ${printer.displayName}` },
        }))
        result.value = `测试页已提交到 ${printer.displayName}：${r.jobId}`
        await loadJobs()
      }
      catch (e) {
        result.value = `测试页提交失败：[${e.code}] ${e.message}`
      }
    }

    async function reprint(job) {
      try {
        await call('print.reprintJob', { printJobId: job.jobId })
        await loadJobs()
      }
      catch (e) { result.value = `重打失败：[${e.code}] ${e.message}` }
    }

    async function removeJob(job) {
      if (!window.confirm(`删除任务 ${job.jobId}？记录与归档 PDF 将一并删除，不可恢复。`)) { return }
      await call('print.removePrintJob', { printJobId: job.jobId })
      await loadJobs()
    }

    async function clearJobs() {
      if (!jobs.value.length) { return }
      if (!window.confirm(`清空全部 ${jobs.value.length} 条任务记录？归档 PDF 将一并删除，不可恢复。`)) { return }
      await call('print.clearPrintJobs')
      await loadJobs()
    }

    return {
      KINDS, CHANNELS, DUPLEX, STATE_TONE, STATE_LABEL,
      printers, jobs, loaded, result, submitting, form,
      selectedPrinter, paperOptions, capsText,
      loadPrinters, loadJobs, submitPrint, submitTestPage, reprint, removeJob, clearJobs,
    }
  },
})

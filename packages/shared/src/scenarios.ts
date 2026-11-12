/**
 * 验机场景目录：场景化验机界面与防漂移校验共用同一份声明。
 *
 * 与 diagnostics.ts 的方法级目录并列：方法目录描述「有哪些 API」，本表描述
 * 「现场怎么用这些 API 验一台设备」。每个能力域一个 ScenarioSpec，用
 * Record<DeviceCapabilityId, ...> 约束，新增能力域漏登记即编译不通过。
 * 通用界面按本表渲染，不按能力域写分支。
 */
import type { DeviceCapabilityId } from './capability'
import type { DiagnosticField } from './diagnostics'

export type ScenarioValue = string | number | boolean
export type ScenarioValues = Readonly<Record<string, ScenarioValue>>

/** 结果呈现方式：通用渲染器按此选择视图组件，不关心是哪个能力域。 */
export type ScenarioResultView = 'json' | 'image' | 'canvas' | 'stream' | 'table' | 'idcard'

/** 附加面板：由渲染器按 id 挂载，场景表只声明要不要。 */
export type ScenarioPanelId = 'printers' | 'jobs' | 'preview'

/** 下拉选项的运行时来源；省略时 options 由字段自带静态值给出。 */
export type ScenarioOptionSource = 'printers' | 'papers' | 'devices' | 'cameras'

/** 内容形态：打印有四种负载，其余能力域给单一形态即可（渲染器自动隐藏切换器）。 */
export interface ScenarioKind {
  id: string
  label: string
  /** 负载形态，供组装入参时判别 */
  payload: 'file' | 'url' | 'html' | 'none'
  /** 该形态的默认纸型 */
  paper?: string
}

export interface ScenarioField extends DiagnosticField {
  /** 仅在指定内容形态下出现；省略表示全部形态可见 */
  kinds?: readonly string[]
  /** 运行时填充的下拉来源 */
  source?: ScenarioOptionSource
  /** 表单分组标题，同组字段排在一起 */
  group?: string
}

export interface ScenarioAction {
  id: string
  label: string
  /** 完整域方法名，如 print.submitPrintJob */
  method: string
  /** 引用的字段 key；空数组表示无参方法 */
  fields: readonly string[]
  /** 入参组装：省略时按 fields 平铺组装 */
  buildInput?: (values: ScenarioValues, kindId: string) => unknown
  /** 覆盖该动作的结果呈现方式 */
  resultView?: ScenarioResultView
  /** 关联的流式事件，执行后开始收历史 */
  event?: string
  /** 破坏性操作需二次确认 */
  dangerous?: boolean
  confirm?: string
  tone?: 'default' | 'outline' | 'destructive'
  hint?: string
}

export interface ScenarioSpec {
  capabilityId: DeviceCapabilityId
  label: string
  summary: string
  icon: string
  kinds: readonly ScenarioKind[]
  fields: readonly ScenarioField[]
  actions: readonly ScenarioAction[]
  resultView: ScenarioResultView
  panels: readonly ScenarioPanelId[]
  events: readonly string[]
  /** 设备下拉的枚举方法；省略表示不提供设备下拉 */
  deviceMethod?: string
}

/** 动作入参：自定义组装优先，否则按 fields 平铺（跳过空值，json / number 按字段类型归一）。 */
export function scenarioInput(spec: ScenarioSpec, action: ScenarioAction, values: ScenarioValues, kindId: string): unknown {
  if (action.buildInput) { return action.buildInput(values, kindId) }
  if (action.fields.length === 0) { return undefined }
  const byKey = new Map(spec.fields.map(f => [f.key, f]))
  const input: Record<string, unknown> = {}
  for (const key of action.fields) {
    const raw = values[key]
    if (raw === undefined || raw === '') { continue }
    const field = byKey.get(key)
    if (field?.kind === 'json') {
      input[key] = typeof raw === 'string' ? JSON.parse(raw) : raw
    }
    else if (field?.kind === 'number') {
      input[key] = Number(raw)
    }
    else {
      input[key] = raw
    }
  }
  return input
}

/** 字段在当前内容形态下是否可见。 */
export function fieldVisible(field: ScenarioField, kindId: string): boolean {
  return !field.kinds || field.kinds.includes(kindId)
}

/** 表单初值：字段默认值铺平，供渲染层直接 v-model。 */
export function scenarioDefaults(fields: readonly ScenarioField[]): Record<string, ScenarioValue> {
  return Object.fromEntries(fields.map(f => [f.key, f.default ?? (f.kind === 'number' ? 0 : '')]))
}

const DEVICES = (id: string): string => `${id}.listDevices`
const CHANNELS = [
  { value: 'auto', label: '自动选择' },
  { value: 'system', label: '系统队列' },
  { value: 'simulated', label: '仿真送打' },
  { value: 'preview', label: '只出预览 PDF' },
  { value: 'dry-run', label: '只算不送打' },
]

/** 打印提交：把表单值组装成统一信封 { printContent, printOptions }。 */
function printSubmit(values: ScenarioValues, kindId: string): unknown {
  const content = kindId === 'pdfurl'
    ? { kind: 'url', url: String(values.fileUrl ?? '').trim(), ...(values.fileType ? { fileType: values.fileType } : {}) }
    : kindId === 'html'
      ? { kind: 'html', html: String(values.htmlData ?? '') }
      : { kind: 'file', path: String(values.filePath ?? '').trim() }
  const options: Record<string, unknown> = {
    paper: values.paper || 'A4',
    copies: Math.max(1, Math.min(999, Number(values.copies) || 1)),
    silent: values.silent !== false,
    grayscale: values.grayscale === true,
    channel: values.channel || 'auto',
  }
  if (values.printerId) { options.printerId = values.printerId }
  if (values.jobName) { options.jobName = values.jobName }
  if (values.duplex) { options.duplex = values.duplex }
  if (values.pages) { options.pages = values.pages }
  if (values.landscape) { options.landscape = true }
  if (values.margin) {
    options.margin = values.margin === 'custom'
      ? {
          topMm: Number(values.marginTop) || 0,
          rightMm: Number(values.marginRight) || 0,
          bottomMm: Number(values.marginBottom) || 0,
          leftMm: Number(values.marginLeft) || 0,
        }
      : values.margin
  }
  // PDF 直通专有参数（SumatraPDF -print-settings / CUPS -o），其余形态不发送
  if (kindId === 'pdf' || kindId === 'pdfurl') {
    if (values.subset) { options.subset = values.subset }
    if (values.scale) { options.scale = values.scale }
    if (values.bin) { options.bin = values.bin }
  }
  return { printContent: content, printOptions: options }
}

const TEST_PAGE_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:"Microsoft YaHei",sans-serif;margin:48px;color:#222}h1{font-size:22px}table{width:100%;border-collapse:collapse}td{border:1px solid #ccc;padding:8px 10px}.sw{height:34px}</style></head><body><h1>打印机测试页</h1><p>编号 TEST · 现场验机</p><table><tr><td style="width:30%">黑白文本</td><td>内容完整清晰即表示通道与纸张设置正常</td></tr><tr><td>灰阶色块</td><td class="sw" style="background:linear-gradient(90deg,#000,#fff)"></td></tr><tr><td>彩色色块</td><td class="sw" style="background:linear-gradient(90deg,#e33,#3a5,#36c)"></td></tr></table></body></html>'

export const DIAGNOSTIC_SCENARIOS: Readonly<Record<DeviceCapabilityId, ScenarioSpec>> = {
  print: {
    capabilityId: 'print',
    label: '打印',
    summary: '图片 / PDF / PDF 链接 / HTML 四种内容，打印机能力、纸型联动与任务簿管理',
    icon: 'Printer',
    kinds: [
      { id: 'image', label: '图片文件', payload: 'file', paper: 'A4' },
      { id: 'pdf', label: 'PDF 文件', payload: 'file', paper: 'A4' },
      { id: 'pdfurl', label: 'PDF 链接', payload: 'url', paper: 'A4' },
      { id: 'html', label: 'HTML', payload: 'html', paper: 'A4' },
    ],
    fields: [
      { key: 'filePath', label: '文件绝对路径', kind: 'file', required: true, kinds: ['image', 'pdf'], placeholder: '选择本地图片或 PDF', hint: '打印前会复制到任务归档目录，源文件不会被改动' },
      { key: 'fileUrl', label: 'PDF 链接', kind: 'text', required: true, kinds: ['pdfurl'], placeholder: 'https://…/report.pdf', hint: '主进程下载后按 PDF 直通打印，源站需在下发白名单内' },
      { key: 'fileType', label: '内容类型提示', kind: 'select', kinds: ['pdfurl'], options: [{ value: '', label: '自动识别' }, { value: 'pdf', label: 'PDF' }, { value: 'image', label: '图片' }] },
      { key: 'htmlData', label: 'HTML 内容', kind: 'textarea', required: true, kinds: ['html'], default: TEST_PAGE_HTML },
      { key: 'printerId', label: '打印机', kind: 'select', source: 'printers', group: '输出选项', options: [{ value: '', label: '系统默认打印机' }] },
      { key: 'paper', label: '纸张', kind: 'select', source: 'papers', group: '输出选项', default: 'A4', options: [{ value: 'A4', label: 'A4（210×297mm）' }] },
      { key: 'channel', label: '通道', kind: 'select', group: '输出选项', default: 'auto', options: CHANNELS },
      { key: 'copies', label: '份数', kind: 'number', group: '输出选项', default: 1, min: 1, max: 999 },
      { key: 'jobName', label: '任务名', kind: 'text', group: '输出选项', placeholder: '留空自动生成' },
      { key: 'silent', label: '静默打印', kind: 'boolean', group: '输出选项', default: true },
      { key: 'grayscale', label: '黑白', kind: 'boolean', group: '输出选项', default: false },
      { key: 'landscape', label: '横向', kind: 'boolean', group: '版式', default: false },
      { key: 'duplex', label: '双面', kind: 'select', group: '版式', options: [{ value: '', label: '单面' }, { value: 'duplex', label: '双面（长边翻页）' }, { value: 'duplexshort', label: '双面（短边翻页）' }, { value: 'simplex', label: '强制单面' }] },
      { key: 'pages', label: '页码范围', kind: 'text', group: '版式', placeholder: '全部（如 1-3,5）' },
      { key: 'margin', label: '边距', kind: 'select', group: '版式', default: 'default', options: [{ value: 'default', label: '默认（驱动设置）' }, { value: 'none', label: '零边距' }, { value: 'custom', label: '自定义…' }] },
      { key: 'marginTop', label: '上 (mm)', kind: 'number', group: '自定义边距', default: 10, min: 0 },
      { key: 'marginRight', label: '右 (mm)', kind: 'number', group: '自定义边距', default: 10, min: 0 },
      { key: 'marginBottom', label: '下 (mm)', kind: 'number', group: '自定义边距', default: 10, min: 0 },
      { key: 'marginLeft', label: '左 (mm)', kind: 'number', group: '自定义边距', default: 10, min: 0 },
      { key: 'subset', label: '奇偶页', kind: 'select', group: 'PDF 直通专有', kinds: ['pdf', 'pdfurl'], options: [{ value: '', label: '全部' }, { value: 'odd', label: '奇数页' }, { value: 'even', label: '偶数页' }] },
      { key: 'scale', label: '缩放', kind: 'select', group: 'PDF 直通专有', kinds: ['pdf', 'pdfurl'], default: 'fit', options: [{ value: 'fit', label: '按纸缩放' }, { value: 'shrink', label: '仅缩小' }, { value: 'noscale', label: '原始尺寸' }] },
      { key: 'bin', label: '纸盒', kind: 'text', group: 'PDF 直通专有', kinds: ['pdf', 'pdfurl'], placeholder: '驱动纸盒名/序号' },
    ],
    actions: [
      { id: 'submit', label: '提交打印', method: 'print.submitPrintJob', fields: ['filePath', 'fileUrl', 'fileType', 'htmlData', 'printerId', 'paper', 'channel', 'copies', 'jobName', 'silent', 'grayscale', 'landscape', 'duplex', 'pages', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'subset', 'scale', 'bin'], buildInput: printSubmit, hint: '提交后可在下方任务簿重打 / 删除，归档 PDF 供重打复用' },
    ],
    resultView: 'json',
    panels: ['printers', 'jobs'],
    events: [],
  },

  capture: {
    capabilityId: 'capture',
    label: '拍摄采集',
    summary: '设备与摄像头枚举、抓拍、实时预览帧、图片转存与打印此图',
    icon: 'Camera',
    kinds: [{ id: 'camera', label: '拍摄', payload: 'none' }],
    fields: [
      { key: 'deviceId', label: '采集设备', kind: 'select', source: 'devices', options: [{ value: '', label: '默认设备' }] },
      { key: 'imageFormat', label: '图片格式', kind: 'select', default: 'jpg', options: [{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'bmp', label: 'BMP' }] },
      { key: 'resolutionIndex', label: '分辨率序号', kind: 'number', min: 0, hint: '留空用设备默认；可从摄像头列表查看支持项' },
      { key: 'imageDataUrl', label: '图片 DataURL', kind: 'textarea', placeholder: 'data:image/png;base64,…', hint: '拍摄结果或预览帧可直接粘贴保存' },
      { key: 'imageExtension', label: '保存扩展名', kind: 'text', default: 'png' },
    ],
    deviceMethod: DEVICES('capture'),
    actions: [
      { id: 'capture', label: '拍摄一张', method: 'capture.captureImage', fields: ['deviceId', 'imageFormat', 'resolutionIndex'], resultView: 'image', hint: '结果图片会显示在右侧预览区' },
      { id: 'previewStart', label: '开始预览', method: 'capture.startPreview', fields: ['deviceId'], event: 'capture.frame', tone: 'outline', hint: '帧经 capture.frame 推送，预览面板实时显示' },
      { id: 'previewStop', label: '停止预览', method: 'capture.stopPreview', fields: ['deviceId'], tone: 'outline' },
      { id: 'save', label: '保存图片', method: 'capture.saveCapturedImage', fields: ['imageDataUrl', 'imageExtension'], tone: 'outline' },
      { id: 'setDefault', label: '设为默认设备', method: 'capture.setDefaultDevice', fields: ['deviceId'], tone: 'outline' },
    ],
    resultView: 'image',
    panels: ['preview'],
    events: ['capture.frame'],
  },

  signature: {
    capabilityId: 'signature',
    label: '签名板',
    summary: '会话管理、笔迹实时绘制、完成回收签名图',
    icon: 'PenLine',
    kinds: [{ id: 'session', label: '签名会话', payload: 'none' }],
    fields: [
      { key: 'deviceId', label: '签名设备', kind: 'select', source: 'devices', options: [{ value: '', label: '默认设备' }] },
    ],
    deviceMethod: DEVICES('signature'),
    actions: [
      { id: 'start', label: '开始会话', method: 'signature.startSigning', fields: ['deviceId'], event: 'signature.stroke', hint: '笔迹经 signature.stroke 推送，画布实时绘制' },
      { id: 'stop', label: '完成并回收', method: 'signature.stopSigning', fields: [], resultView: 'image', tone: 'outline' },
      { id: 'clear', label: '清板', method: 'signature.clearSignature', fields: [], tone: 'outline' },
      { id: 'cancel', label: '取消会话', method: 'signature.cancelSigning', fields: [], tone: 'destructive' },
    ],
    resultView: 'canvas',
    panels: [],
    events: ['signature.stroke'],
  },

  idcard: {
    capabilityId: 'idcard',
    label: '身份证',
    summary: '读卡器枚举、证卡读取与照片 / 字段展示',
    icon: 'IdCard',
    kinds: [{ id: 'read', label: '读取证卡', payload: 'none' }],
    fields: [
      { key: 'deviceId', label: '读卡器', kind: 'select', source: 'devices', options: [{ value: '', label: '首个就绪设备' }] },
    ],
    deviceMethod: DEVICES('idcard'),
    actions: [
      { id: 'read', label: '读取证卡', method: 'idcard.readCard', fields: ['deviceId'], resultView: 'idcard', hint: '将证件放在阅读器上再点击' },
    ],
    resultView: 'idcard',
    panels: [],
    events: [],
  },

  iccard: {
    capabilityId: 'iccard',
    label: 'IC 卡',
    summary: '扇区读取、写块、字符串组读写（Mifare）',
    icon: 'CreditCard',
    kinds: [{ id: 'card', label: 'IC 卡操作', payload: 'none' }],
    fields: [
      { key: 'deviceId', label: '读卡器', kind: 'select', source: 'devices', options: [{ value: '', label: '首个就绪设备' }] },
      { key: 'sectorNumber', label: '扇区 (0-15)', kind: 'number', default: 1, min: 0, max: 15 },
      { key: 'sectorKey', label: '扇区密钥', kind: 'text', placeholder: 'FFFFFFFFFFFF', hint: '12 位 hex，留空用出厂白键' },
      { key: 'keyType', label: '密钥类型', kind: 'select', default: 'A', options: [{ value: 'A', label: 'A 键' }, { value: 'B', label: 'B 键' }] },
      { key: 'blockNumber', label: '块地址 (0-63)', kind: 'number', default: 4, min: 0, max: 63 },
      { key: 'blockData', label: '写入数据', kind: 'text', default: '000102030405060708090A0B0C0D0E0F', placeholder: '32 位 hex = 16 字节' },
      { key: 'textBlocks', label: '字符串组', kind: 'json', default: '["1","2","1051851"]', hint: '每行一条，最多 3 条、每条 ≤16 字节' },
    ],
    deviceMethod: DEVICES('iccard'),
    actions: [
      { id: 'readSector', label: '读取扇区', method: 'iccard.readSector', fields: ['deviceId', 'sectorNumber', 'sectorKey', 'keyType'], resultView: 'table', hint: '密钥控制块不回读' },
      { id: 'writeSector', label: '写入块', method: 'iccard.writeSector', fields: ['deviceId', 'blockNumber', 'blockData', 'sectorKey', 'keyType'], dangerous: true, confirm: '覆盖写入 16 字节且不可恢复，确认继续？', tone: 'destructive' },
      { id: 'writeTexts', label: '写入字符串组', method: 'iccard.writeTextBlocks', fields: ['deviceId', 'sectorNumber', 'textBlocks', 'sectorKey', 'keyType'], dangerous: true, confirm: '整扇区覆盖且不可恢复，确认继续？', tone: 'destructive' },
    ],
    resultView: 'table',
    panels: [],
    events: [],
  },

  scanner: {
    capabilityId: 'scanner',
    label: '扫码枪',
    summary: '模拟扫码与真枪共用缓冲链路，扫码历史实时累积',
    icon: 'ScanLine',
    kinds: [{ id: 'scan', label: '扫码', payload: 'none' }],
    fields: [
      { key: 'scannedCode', label: '扫码内容', kind: 'text', required: true, default: 'PB:1234567890', placeholder: '如 PB:1234567890' },
    ],
    actions: [
      { id: 'simulate', label: '模拟一次扫码', method: 'scanner.simulateScan', fields: ['scannedCode'], event: 'scanner.scanned', hint: '与真枪走完全相同的缓冲 → 广播链路；需先在设备配置页开启演示模式' },
    ],
    resultView: 'stream',
    panels: [],
    events: ['scanner.scanned'],
  },
}

/** 全部场景登记的能力 id，供一致性校验与界面渲染取用。 */
export const SCENARIO_CAPABILITY_IDS: readonly DeviceCapabilityId[]
  = Object.keys(DIAGNOSTIC_SCENARIOS) as DeviceCapabilityId[]

/** 全部场景动作引用的方法名，供防漂移校验比对真实域定义。 */
export function scenarioMethodKeys(): string[] {
  return Object.values(DIAGNOSTIC_SCENARIOS).flatMap(spec => spec.actions.map(a => a.method))
}

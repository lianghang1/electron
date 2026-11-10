/**
 * 域方法目录：调试台表单、能力矩阵灰置、防漂移校验共用同一份数据。
 * 方法名必须与各域 defineDomain 的键一致；入参字段的默认值可构造出合法调用，
 * 由 e2e 对每个方法的默认入参跑真实 input schema 的 safeParse 验证。
 */
export type DiagnosticFieldKind = 'text' | 'number' | 'select' | 'boolean' | 'textarea' | 'json'

export interface DiagnosticField {
  key: string
  label: string
  kind: DiagnosticFieldKind
  /** 必填字段不因空值省略 */
  required?: boolean
  default?: string | number | boolean
  options?: readonly { value: string, label: string }[]
  placeholder?: string
  hint?: string
  min?: number
  max?: number
}

export interface DiagnosticMethod {
  /** 不含域前缀的方法名 */
  name: string
  label: string
  description: string
  /** 只读探测（枚举/查询）不改写设备或数据 */
  readOnly: boolean
  /** 写卡、清空任务簿等破坏性操作需二次确认 */
  dangerous?: boolean
  /** 空数组 = 无参方法；key === '$input' 的 json 字段代表整个入参对象 */
  fields: readonly DiagnosticField[]
  /** 关联的流式事件（预览帧 / 扫码 / 笔迹） */
  event?: string
}

export interface DiagnosticDomain {
  /** 域 id，与能力矩阵 availableDomains 同源 */
  name: string
  label: string
  description: string
  icon: string
  methods: readonly DiagnosticMethod[]
}

const noFields: readonly DiagnosticField[] = []

function jsonInput(label: string, value: string, hint?: string): DiagnosticField {
  return {
    key: '$input',
    label,
    kind: 'json',
    required: true,
    default: value,
    hint,
  }
}

function text(key: string, label: string, value = '', extra: Partial<DiagnosticField> = {}): DiagnosticField {
  return {
    key,
    label,
    kind: 'text',
    default: value,
    ...extra,
  }
}

function number(key: string, label: string, extra: Partial<DiagnosticField> = {}): DiagnosticField {
  return {
    key,
    label,
    kind: 'number',
    ...extra,
  }
}

function select(key: string, label: string, options: readonly { value: string, label: string }[], extra: Partial<DiagnosticField> = {}): DiagnosticField {
  return {
    key,
    label,
    kind: 'select',
    options,
    ...extra,
  }
}

export const DIAGNOSTIC_CATALOG: readonly DiagnosticDomain[] = [
  {
    name: 'capture',
    label: '拍摄采集',
    description: '高拍仪 / 摄像头：设备枚举、拍照、实时预览、存盘',
    icon: 'Camera',
    methods: [
      { name: 'listDevices', label: '设备列表', description: '枚举全部采集设备与就绪状态', readOnly: true, fields: noFields },
      { name: 'listDeviceConfigs', label: '配置档案', description: '读取当前设备配置覆盖', readOnly: true, fields: noFields },
      { name: 'getDefaultDevice', label: '默认设备', description: '读取当前默认采集设备', readOnly: true, fields: noFields },
      { name: 'findDefaultDevice', label: '解析默认设备', description: '按就绪状态解析实际可用设备', readOnly: true, fields: noFields },
      { name: 'listDeviceCameras', label: '摄像头列表', description: '枚举设备支持的摄像头与分辨率', readOnly: true, fields: [text('deviceId', '设备 id', '', { hint: '留空解析默认设备' })] },
      {
        name: 'captureImage',
        label: '拍摄一张',
        description: '按设备/格式/分辨率抓拍并落盘',
        readOnly: false,
        fields: [
          text('deviceId', '设备 id', '', { hint: '留空解析默认设备' }),
          select('imageFormat', '图片格式', [
            { value: 'jpg', label: 'JPG' },
            { value: 'png', label: 'PNG' },
            { value: 'bmp', label: 'BMP' },
          ], { default: 'jpg' }),
          number('resolutionIndex', '分辨率序号', { hint: '留空用设备默认', min: 0 }),
        ],
      },
      { name: 'saveCapturedImage', label: '保存 DataURL', description: '把 base64 图片写入采集产物目录', readOnly: false, fields: [text('imageDataUrl', '图片 DataURL', 'data:image/png;base64,', { required: true }), text('imageExtension', '扩展名', 'png')] },
      { name: 'startPreview', label: '开始预览', description: '启动实时预览，帧经 capture.frame 事件推送', readOnly: false, event: 'capture.frame', fields: [text('deviceId', '设备 id', '', { hint: '留空解析默认设备' })] },
      { name: 'stopPreview', label: '停止预览', description: '停止指定设备的实时预览', readOnly: false, fields: [text('deviceId', '设备 id', 'uvc:0', { required: true, hint: '填开始预览时使用的设备 id' })] },
      { name: 'setDefaultDevice', label: '设置默认设备', description: '设定默认采集设备；空值清除', readOnly: false, fields: [text('deviceId', '设备 id', '', { required: true, hint: '留空表示清除默认设备' })] },
      { name: 'setConfig', label: '写入配置', description: '按档案 id 覆盖采集设备配置', readOnly: false, fields: [jsonInput('配置 JSON', '{"deviceProfileId":"default","overrides":{}}')] },
    ],
  },
  {
    name: 'idcard',
    label: '身份证',
    description: '身份证阅读器：读卡器枚举、证卡读取与字段展示',
    icon: 'IdCard',
    methods: [
      { name: 'listDevices', label: '读卡器列表', description: '枚举身份证读卡器与就绪状态', readOnly: true, fields: noFields },
      { name: 'readCard', label: '读取证卡', description: '读取证卡文字信息与照片', readOnly: false, fields: [text('deviceId', '读卡器 id', '', { hint: '留空定位首个就绪设备' })] },
      { name: 'getConfig', label: '读取配置', description: '读取身份证读卡器配置', readOnly: true, fields: noFields },
      { name: 'setConfig', label: '写入配置', description: '按档案 id 覆盖读卡器配置', readOnly: false, fields: [jsonInput('配置 JSON', '{"deviceProfileId":"default","overrides":{}}')] },
    ],
  },
  {
    name: 'iccard',
    label: 'IC 卡',
    description: 'IC 卡读写：扇区读取、写块、字符串组读写',
    icon: 'CreditCard',
    methods: [
      { name: 'listDevices', label: '读卡器列表', description: '枚举 IC 卡读卡器与能力', readOnly: true, fields: noFields },
      {
        name: 'readSector',
        label: '读取扇区',
        description: '按扇区与密钥读取块数据',
        readOnly: false,
        fields: [
          text('deviceId', '读卡器 id', '', { hint: '留空定位首个就绪设备' }),
          number('sectorNumber', '扇区', { default: 1, min: 0, max: 15 }),
          text('sectorKey', '扇区密钥', '', { hint: '12 位 hex，留空用出厂白键', placeholder: 'FFFFFFFFFFFF' }),
          select('keyType', '密钥类型', [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }], { default: 'A' }),
        ],
      },
      {
        name: 'writeSector',
        label: '写入块',
        description: '覆盖指定块的 16 字节，不可恢复',
        readOnly: false,
        dangerous: true,
        fields: [
          text('deviceId', '读卡器 id', '', { hint: '留空定位首个就绪设备' }),
          number('blockNumber', '块地址', { default: 4, min: 0, max: 63, required: true }),
          text('blockData', '数据（32 位 hex）', '000102030405060708090A0B0C0D0E0F', { required: true, placeholder: '000102030405060708090A0B0C0D0E0F' }),
          text('sectorKey', '扇区密钥', '', { hint: '12 位 hex，留空用出厂白键' }),
          select('keyType', '密钥类型', [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }], { default: 'A' }),
        ],
      },
      {
        name: 'writeTextBlocks',
        label: '写入字符串组',
        description: '整扇区覆盖为字符串组，不可恢复',
        readOnly: false,
        dangerous: true,
        fields: [
          text('deviceId', '读卡器 id', '', { hint: '留空定位首个就绪设备' }),
          number('sectorNumber', '扇区', { default: 1, min: 1, max: 15, required: true }),
          { key: 'textBlocks', label: '字符串组（JSON 数组）', kind: 'json', required: true, default: '["1","2","1051851"]', hint: '每条不超过 16 字节，最多 3 条' },
          text('sectorKey', '扇区密钥', '', { hint: '12 位 hex，留空用出厂白键' }),
          select('keyType', '密钥类型', [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }], { default: 'A' }),
        ],
      },
      { name: 'getConfig', label: '读取配置', description: '读取 IC 卡读卡器配置', readOnly: true, fields: noFields },
      { name: 'setConfig', label: '写入配置', description: '按档案 id 覆盖读卡器配置', readOnly: false, fields: [jsonInput('配置 JSON', '{"deviceProfileId":"default","overrides":{}}')] },
    ],
  },
  {
    name: 'signature',
    label: '签名板',
    description: '手写签名板：会话管理、笔迹实时推送',
    icon: 'PenLine',
    methods: [
      { name: 'listDevices', label: '设备列表', description: '枚举签名板与就绪状态', readOnly: true, fields: noFields },
      { name: 'startSigning', label: '开始会话', description: '启动签名会话，笔迹经 signature.stroke 推送', readOnly: false, event: 'signature.stroke', fields: [text('deviceId', '设备 id', '', { hint: '留空定位首个就绪设备' })] },
      { name: 'stopSigning', label: '完成并回收', description: '结束会话并返回签名图像与笔迹', readOnly: false, fields: noFields },
      { name: 'clearSignature', label: '清板', description: '清空当前签名板内容', readOnly: false, fields: noFields },
      { name: 'cancelSigning', label: '取消会话', description: '取消当前签名会话', readOnly: false, fields: noFields },
      { name: 'getConfig', label: '读取配置', description: '读取签名板配置', readOnly: true, fields: noFields },
      { name: 'setConfig', label: '写入配置', description: '按档案 id 覆盖签名板配置', readOnly: false, fields: [jsonInput('配置 JSON', '{"deviceProfileId":"default","overrides":{}}')] },
    ],
  },
  {
    name: 'scanner',
    label: '扫码枪',
    description: '扫码枪：配置读写与扫码模拟',
    icon: 'ScanLine',
    methods: [
      { name: 'getConfig', label: '读取配置', description: '读取扫码枪启停与前缀规则', readOnly: true, fields: noFields },
      { name: 'setConfig', label: '写入配置', description: '覆盖扫码枪配置', readOnly: false, fields: [jsonInput('配置 JSON', '{"enabled":true,"activeProfileId":"scanner","deviceId":"scanner","overrides":{}}')] },
      { name: 'simulateScan', label: '模拟扫码', description: '注入一条扫码内容，触发 scanner.scanned 事件', readOnly: false, event: 'scanner.scanned', fields: [text('scannedCode', '扫码内容', 'PB:1234567890', { required: true })] },
    ],
  },
  {
    name: 'print',
    label: '打印',
    description: '统一打印：任务提交、打印机枚举、任务簿管理',
    icon: 'Printer',
    methods: [
      {
        name: 'submitPrintJob',
        label: '提交打印',
        description: '提交文件 / URL / HTML 打印任务',
        readOnly: false,
        fields: [jsonInput('任务 JSON', '{"printContent":{"kind":"html","html":"<h1>自检测试页</h1>"},"printOptions":{"paper":"A4"}}', 'printContent.kind 支持 file / url / html')],
      },
      { name: 'listDevices', label: '打印机列表', description: '枚举系统打印机与纸张规格', readOnly: true, fields: noFields },
      { name: 'getJobStatus', label: '任务状态', description: '按 printJobId 查询打印任务状态', readOnly: true, fields: [text('printJobId', '任务 id', 'job-0001', { required: true, hint: '从任务列表复制真实 printJobId' })] },
      { name: 'listPrintJobs', label: '任务列表', description: '列出近期打印任务记录', readOnly: true, fields: [number('maxCount', '条数上限', { default: 20, min: 1 })] },
      { name: 'removePrintJob', label: '删除任务', description: '删除任务记录与归档文件，不可恢复', readOnly: false, dangerous: true, fields: [text('printJobId', '任务 id', 'job-0001', { required: true, hint: '从任务列表复制真实 printJobId' })] },
      { name: 'clearPrintJobs', label: '清空任务簿', description: '清空全部任务记录与归档，不可恢复', readOnly: false, dangerous: true, fields: noFields },
      { name: 'reprintJob', label: '重打', description: '按 printJobId 重新提交归档文件', readOnly: false, fields: [text('printJobId', '任务 id', 'job-0001', { required: true, hint: '从任务列表复制真实 printJobId' })] },
    ],
  },
]

/** 表单值 → 合法入参；$input 的 json 字段直接作为整个入参对象，无字段的方法返回 undefined */
export function buildDiagnosticInput(
  fields: readonly DiagnosticField[],
  values: Readonly<Record<string, string | number | boolean>>,
): unknown {
  if (fields.length === 0) { return undefined }
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = values[field.key]
    if (field.kind === 'json') {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (field.key === '$input') { return parsed }
      if (parsed !== undefined && parsed !== null) { result[field.key] = parsed }
      continue
    }
    if (raw === undefined || raw === '') {
      if (field.required) { result[field.key] = field.default ?? '' }
      continue
    }
    if (field.kind === 'number') { result[field.key] = Number(raw) }
    else if (field.kind === 'boolean') { result[field.key] = raw === true || raw === 'true' }
    else { result[field.key] = raw }
  }
  return result
}

/** 表单初值：字段默认值铺平，供渲染层直接 v-model */
export function diagnosticDefaults(fields: readonly DiagnosticField[]): Record<string, string | number | boolean> {
  return Object.fromEntries(fields.map(field => [field.key, field.default ?? (field.kind === 'number' ? 0 : '')]))
}

/** 全部方法键（"域.方法"），供能力矩阵与防漂移校验使用 */
export function diagnosticMethodKeys(): string[] {
  return DIAGNOSTIC_CATALOG.flatMap(domain => domain.methods.map(method => `${domain.name}.${method.name}`))
}

/**
 * 统一打印 API 契约类型（唯一事实来源）。
 * 渲染进程 / preload / 主进程共用本文件，任何通道与平台差异都必须在主进程内部消化。
 */

export type ChannelId = 'system' | 'raw' | 'ipp'
export type ChannelPreference = ChannelId | 'auto'

/** 内容来源 —— 统一信封 */
export interface TemplatePayload {
  kind: 'template'
  templateId: string
  data: Record<string, unknown>
}
export interface FilePayload {
  kind: 'file'
  path: string
}
/** URL 负载：main 进程下载到任务归档目录后复用 file 通道（PDF 直通 / 图片转查看器） */
export interface UrlPayload {
  kind: 'url'
  url: string
  /** 内容类型提示：显式声明优先于自动识别；缺省走识别链（Content-Type → URL 扩展名 → PDF 兜底） */
  fileType?: 'pdf' | 'image'
}
export interface HtmlPayload {
  kind: 'html'
  html: string
}
export interface RawPayload {
  kind: 'raw'
  bytes: Uint8Array
  dialect: 'escpos' | 'tspl'
}
export type PrintPayload = TemplatePayload | FilePayload | UrlPayload | HtmlPayload | RawPayload

/** 纸张 —— 物理尺寸（mm），各通道自行翻译；heightMm = 0 表示连续卷纸（高度由纸卷决定） */
export interface PaperSpec {
  /** 纸宽（mm） */
  widthMm: number
  /** 纸高（mm）；0 = 连续纸 */
  heightMm: number
}

/** 硬件控制 —— 声明式；通道不支持时返回 OPTION_UNSUPPORTED，绝不静默忽略 */
export interface HardwareControls {
  cut?: 'none' | 'partial' | 'full'
  openCashbox?: boolean
  /** 切纸前走纸 N 行 */
  feedLines?: number
}

export type Overlay
  = | { type: 'qrcode', data: string, sizeMm?: number }
    | { type: 'barcode', data: string, format: 'code128' | 'ean13', heightMm?: number }

export interface PrintOptions {
  /**
   * 纸张写法（主进程解析为物理尺寸）：ISO 216 序号纸 'a0'–'a10'/'b0'–'b10'
   * 及 'letter'/'legal'/'tabloid'（大小写不敏感）、行业通称 'receipt58'/'receipt80'
   * （连续小票纸）、纯宽 '80'（80mm 连续纸）、'宽x高' 如 '80x60'
   * （分隔符支持 x/X/×/*，单位 mm）；无法识别 → VALIDATION_FAILED
   */
  paper: string
  copies?: number
  /** 默认 true；system 通道 false 时弹原生打印对话框，raw/ipp 恒静默 */
  silent?: boolean
  grayscale?: boolean
  /** 页码范围，如 "1-3,5"（PDF 直通与系统队列 HTML 路径支持；macOS 仅支持单段范围） */
  pages?: string
  /** 奇偶页打印（先打单面再翻面续打的场景）；PDF 文件直通支持（Windows SumatraPDF / macOS·Linux CUPS），HTML/图片路径忽略 */
  subset?: 'odd' | 'even'
  /** 缩放策略（缺省 fit）；CUPS 路径仅 fit 生效（shrink 为其缺省行为，noscale 不支持），HTML/图片路径忽略 */
  scale?: 'noscale' | 'shrink' | 'fit'
  /** 纸盒/送纸器（驱动纸盒名或序号）；PDF 文件直通支持（CUPS 的 InputSlot 名依驱动），HTML/图片路径忽略 */
  bin?: string
  /** 双面打印 */
  duplex?: 'simplex' | 'duplex' | 'duplexshort' | 'duplexlong'
  /** 横向打印（默认纵向） */
  landscape?: boolean
  /**
   * 页边距（默认 'default' 跟随驱动）：
   * - 'none' 零边距
   * - 自定义四边 mm：system 通道 Chromium 路径（webContents.print/printToPDF）与 CUPS lp 支持，
   *   SumatraPDF 直通不支持（该通道忽略，用 fit 缩放）
   */
  margin?: 'default' | 'none' | { topMm: number, rightMm: number, bottomMm: number, leftMm: number }
  printerId?: string
  /** 默认 auto，按确定性规则路由 */
  channel?: ChannelPreference
  /** 打印队列里显示的任务名 */
  jobName?: string
  hardware?: HardwareControls
  overlays?: Overlay[]
  /** 业务追踪字段（订单号等），结果原样带回 */
  meta?: Record<string, string>
}

export type PrintLogFn = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
) => void

/** 统一打印请求信封：内容负载 + 打印选项。路由与校验全部由 payload 派生，无业务类型声明字段 */
export interface PrintRequest {
  payload: PrintPayload
  options: PrintOptions
}

/** 跨平台跨通道一致的错误码 */
export type PrintErrorCode
  = | 'PRINTER_NOT_FOUND'
    | 'PRINTER_OFFLINE'
    | 'PRINTER_BUSY'
    | 'PAPER_MISMATCH'
    | 'OPTION_UNSUPPORTED'
    | 'RENDER_FAILED'
    | 'SPOOL_FAILED'
    | 'JOB_CANCELED'
    | 'JOB_FAILED'
    | 'CHANNEL_UNAVAILABLE'
    | 'PRINTER_DEFAULT_MISSING'
    | 'VALIDATION_FAILED'
    | 'UNKNOWN'

export interface PrintError {
  code: PrintErrorCode
  message: string
  detail?: unknown
}

/** 打印成功结果（失败以 IpcRemoteError 抛出，code 见 PrintErrorCode；任务簿失败记录见 JobStatus.error） */
export interface PrintResult {
  /** 统一任务号：重打、查状态、幂等去重都用它 */
  jobId: string
  /** 实际通道，仅审计/排查用，业务层不得据此分支 */
  channel: ChannelId
  printerId: string
  meta?: Record<string, string>
  /** HTML/模板路径生成的 PDF 存档（重打依据） */
  archivedPdfPath?: string
  /** 通道私有审计信息（如 mock 落盘路径、送打方式与参数），可读但不得用于业务分支 */
  detail?: unknown
}

/** 设备驱动上报的纸张表单（名字 + 物理尺寸），来源 winspool DeviceCapabilitiesW / CUPS lpoptions+PPD */
export interface PrinterPaper {
  /** 驱动表单名（打印机属性里展示的纸型名） */
  name: string
  /** 物理尺寸（mm，保留 0.1mm 精度）；连续纸高度为 0 */
  widthMm?: number
  heightMm?: number
}

/** 打印机驱动默认值（打印首选项：Windows DEVMODE / CUPS 默认选项） */
export interface PrinterDefaults {
  /** 默认纸张的驱动表单名（对应 paperList 中一项） */
  formName?: string
  /** 默认方向（默认纵向） */
  orientation?: 'portrait' | 'landscape'
  /** 默认单双面 */
  duplex?: 'simplex' | 'duplexlong' | 'duplexshort'
  /** 默认是否彩色输出 */
  color?: boolean
  /** 默认份数（>1 时才有意义） */
  copies?: number
}

export interface PrinterCaps {
  cut?: boolean
  openCashbox?: boolean
  /** 是否支持指令级二维码（区别于模板内 HTML 渲染） */
  qrcodeDirect?: boolean
  barcodeDirect?: boolean
  maxWidthMm?: number
  /** 设备上报的纸张列表（系统打印机来自驱动 winspool/CUPS）；网络直连无驱动查询通道，数据为空 */
  paperList?: PrinterPaper[]
  /** 驱动默认值（打印首选项）；平台读取失败时缺省 */
  defaults?: PrinterDefaults
  /** 支持双面打印（Windows DC_DUPLEX / CUPS Duplex 选项） */
  duplexSupported?: boolean
  /** 支持彩色打印（Windows DC_COLORDEVICE / CUPS ColorModel） */
  colorSupported?: boolean
}

export interface UnifiedPrinter {
  /** 统一 ID：系统打印机 = deviceName；网络直连 = "raw:<host>:<port>" */
  id: string
  displayName: string
  source: 'system' | 'network' | 'ipp'
  isDefault: boolean
  status: 'ready' | 'offline' | 'unknown'
  capabilities: PrinterCaps
  /** 平台原始信息放这里，业务层不读 */
  meta: Record<string, unknown>
}

export interface JobStatus {
  jobId: string
  jobName?: string
  state: 'accepted' | 'printing' | 'done' | 'failed'
  createdAt: string
  finishedAt?: string
  /** 成功结果（state = done 时存在） */
  result?: PrintResult
  /** 失败原因（state = failed 时存在） */
  error?: PrintError
}

/** 网络直连打印机档案（宿主注入的现场数据：IP/端口/协议/mock） */
export interface RawPrinterConfig {
  id: string
  displayName: string
  protocol: 'escpos' | 'star'
  transport: { type: 'tcp', host: string, port: number }
  mock?: boolean
  mockOutputDir?: string
  isDefault?: boolean
  capabilities?: PrinterCaps
}

/**
 * 统一打印 API 契约类型（唯一事实来源）。
 * 渲染进程 / preload / 主进程共用本文件，任何通道与平台差异都必须在主进程内部消化。
 */

/** 业务语义类型 —— 决定排版引擎与默认路由，不绑定通道 */
export type PrintKind = 'receipt' | 'label' | 'document' | 'image' | 'pdf'

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
  dialect: 'escpos' | 'zpl' | 'tspl'
}
export type PrintPayload = TemplatePayload | FilePayload | UrlPayload | HtmlPayload | RawPayload

/** 纸张 —— 业务语义，各通道自行翻译；也支持传纸型库 ID（见 PaperProfile） */
export type PaperSpec
  = | { preset: 'receipt58' | 'receipt80' | 'a4' | 'a5' | 'b5' | 'letter' | 'legal' | 'tabloid' }
    | { preset: 'label', widthMm: number, heightMm: number, gapMm?: number }
    | { preset: 'custom', widthMm: number, heightMm: number }

/** submit/renderPreview 的 paper 入参：纸型对象或纸型库 ID（PAPER_LIBRARY） */
export type PaperInput = PaperSpec | string

/** 纸型库条目 */
export interface PaperProfile {
  id: string
  displayName: string
  spec: PaperSpec
  builtIn?: boolean
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
  /** 纸型：PaperSpec 对象或纸型库 ID（PAPER_LIBRARY） */
  paper: PaperInput
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

/** 打印预设：把"模板 + 纸型 + 打印机 + 参数"绑成一个业务单据，一键打印 */
export interface PrintPreset {
  id: string
  displayName: string
  businessType: PrintKind
  /** template 负载时必填 */
  templateId?: string
  paper: PaperInput
  printerId?: string
  copies?: number
  silent?: boolean
  channel?: ChannelPreference
  duplex?: 'simplex' | 'duplex' | 'duplexshort' | 'duplexlong'
  pages?: string
  /** 横向打印（默认纵向）；HTML 走 webContents.print landscape，PDF 直通走 SumatraPDF/lp */
  landscape?: boolean
  grayscale?: boolean
  hardware?: HardwareControls
}

export interface PrintRequest {
  businessType: PrintKind
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

export interface PrinterCaps {
  cut?: boolean
  openCashbox?: boolean
  /** 是否支持指令级二维码（区别于模板内 HTML 渲染） */
  qrcodeDirect?: boolean
  barcodeDirect?: boolean
  maxWidthMm?: number
  paperPresets?: string[]
  /** 设备驱动上报的纸张表单名（Windows: Win32_Printer.PrinterPaperNames；Linux: lpoptions PageSize） */
  paperForms?: string[]
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
  businessType?: PrintKind
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
  protocol: 'escpos' | 'star' | 'zpl'
  transport: { type: 'tcp', host: string, port: number }
  mock?: boolean
  mockOutputDir?: string
  isDefault?: boolean
  capabilities?: PrinterCaps
}

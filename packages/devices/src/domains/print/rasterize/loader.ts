import { printError } from '../errors'

/**
 * PDF 加载侧校验（conflux PdfImageConverter.loadPdf / checkRenderSize 移植）：
 * 把"底层解析器报难懂错误"提前为可排查的明确提示。
 */

/** 单页渲染位图内存上限（宽×高×4 字节 ARGB，1GB；Java MAX_SINGLE_PAGE_RENDER_BYTES） */
export const MAX_SINGLE_PAGE_RENDER_BYTES = 1 << 30

/**
 * 加载前校验 %PDF- 魔数（Java loadPdf L825-841）：错误页/空文件/损坏输入
 * 若放给 PDF 解析器，报错难以定位；此处前置拦截并附输入开头预览（16 字节，
 * 非 ASCII 可打印字符显示为 '.'）。
 */
export function assertPdfMagic(data: Uint8Array): void {
  const isPdf = data.length >= 5 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46
  if (isPdf) { return }
  let head = ''
  for (let i = 0; i < Math.min(16, data.length); i++) {
    const c = data[i] & 0xFF
    head += c >= 32 && c < 127 ? String.fromCharCode(c) : '.'
  }
  throw printError(
    'VALIDATION_FAILED',
    `输入不是有效的 PDF：未找到 %PDF- 文件头（大小 ${data.length} 字节，开头: ${head}）。请检查上游数据源：HTTP 下载是否返回错误页、Base64 是否正确、文件是否完整`,
  )
}

/**
 * 渲染前估算单页位图内存（页面 pt 尺寸 × DPI，Java checkRenderSize L808-819）：
 * 超大图纸页（如 CAD 导出）配高 DPI 时单页位图可达数 GB，不拦截会在渲染器内部
 * 抛出难定位的 OOM。pageWidthPt/pageHeightPt 取页面 CropBox（Java 语义）。
 */
export function checkRenderSize(pageWidthPt: number, pageHeightPt: number, dpi: number, pageIndex: number): void {
  const pxW = Math.ceil(pageWidthPt / 72.0 * dpi)
  const pxH = Math.ceil(pageHeightPt / 72.0 * dpi)
  const bytes = pxW * pxH * 4
  if (bytes > MAX_SINGLE_PAGE_RENDER_BYTES) {
    throw printError(
      'RENDER_FAILED',
      `第 ${pageIndex + 1} 页渲染内存超限：页面 ${Math.round(pageWidthPt)} x ${Math.round(pageHeightPt)} pt @ ${dpi} DPI 约需 ${Math.round(bytes / 1048576)} MB 位图（单页上限 1024 MB）。请降低 DPI、拆分源文件，或联系管理员调整上限`,
    )
  }
}

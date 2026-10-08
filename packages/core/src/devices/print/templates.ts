/// <reference path="./env.d.ts" />
import type { PaperSpec } from '@desktop/shared'
import QRCode from 'qrcode'
import { printError } from './errors'
import { paperHeightMm, paperWidthMm } from './paper'
import { renderTemplate } from './template-engine'

import documentHtml from './templates/document-a4.html?raw'
import imageViewerHtml from './templates/image-viewer.html?raw'
import labelHtml from './templates/label.html?raw'
import receiptHtml from './templates/receipt-80.html?raw'

export const RECEIPT_TEMPLATE_ID = 'receipt-default'
export const DOCUMENT_TEMPLATE_ID = 'document-default'
export const LABEL_TEMPLATE_ID = 'label-default'
export const IMAGE_VIEWER_TEMPLATE_ID = 'image-viewer'

const TEMPLATE_HTML: Record<string, string> = {
  [RECEIPT_TEMPLATE_ID]: receiptHtml,
  [DOCUMENT_TEMPLATE_ID]: documentHtml,
  [LABEL_TEMPLATE_ID]: labelHtml,
}

export function getTemplateHtml(templateId: string): string | undefined {
  return TEMPLATE_HTML[templateId]
}

export function listTemplateIds(): string[] {
  return Object.keys(TEMPLATE_HTML)
}

/** 热敏纸实际可打宽度：58 纸≈48mm，80 纸≈72mm，标签/自定义留 2mm */
export function printableWidthMm(paper: PaperSpec): number {
  switch (paper.preset) {
    case 'receipt58':
      return 48
    case 'receipt80':
      return 72
    case 'label':
    case 'custom':
      return paper.widthMm - 2
    default:
      return paperWidthMm(paper) - 32 // A4 等由 @page margin 控制，此值仅供模板参考
  }
}

/**
 * 渲染模板为 HTML。模板变量 = 业务 data + 纸张派生变量（pageWidthMm/pageHeightMm/printableWidthMm）。
 * 注：QRCode.toDataURL 不带回调时返回 Promise，故本函数为 async。
 */
export async function renderTemplateHtml(
  templateId: string,
  data: Record<string, unknown>,
  paper: PaperSpec,
): Promise<string> {
  const tpl = TEMPLATE_HTML[templateId]
  if (!tpl) {
    throw printError('RENDER_FAILED', `未知的打印模板: ${templateId}`, { available: listTemplateIds() })
  }
  const enriched: Record<string, unknown> = {
    ...data,
    pageWidthMm: paperWidthMm(paper),
    pageHeightMm: paperHeightMm(paper) ?? 'auto',
    printableWidthMm: printableWidthMm(paper),
  }
  // HTML 通道的二维码：业务数据 qrData → 内嵌 dataURL 图片（指令直写通道由打印机指令生成）
  const qrData = enriched.qrData != null ? String(enriched.qrData) : ''
  if (qrData) {
    enriched.qrImageUrl = await QRCode.toDataURL(qrData, { margin: 0, width: 240 })
    enriched.codeImageUrl = enriched.qrImageUrl
  }
  return renderTemplate(tpl, enriched)
}

/** 图片打印：包一层图片查看模板（图片以 dataURL 内嵌，避免 file:// 安全限制） */
export function renderImageViewerHtml(imageDataUrl: string, paper: PaperSpec): string {
  const cssPageSize
    = paper.preset === 'receipt58' || paper.preset === 'receipt80'
      ? `${paperWidthMm(paper)}mm auto`
      : paper.preset === 'a4'
        ? 'A4'
        : paper.preset === 'a5'
          ? 'A5'
          : paper.preset === 'letter'
            ? 'Letter'
            : `${paperWidthMm(paper)}mm ${paperHeightMm(paper)}mm`
  const pageMarginMm = paper.preset === 'receipt58' || paper.preset === 'receipt80' ? 0 : 10
  return renderTemplate(imageViewerHtml, { imageDataUrl, cssPageSize, pageMarginMm })
}

export const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

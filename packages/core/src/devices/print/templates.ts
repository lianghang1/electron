/// <reference path="./env.d.ts" />
import type { PaperSpec } from '@desktop/shared'
import { renderTemplate } from './template-engine'

import imageViewerHtml from './templates/image-viewer.html?raw'

/** 图片打印：包一层图片查看模板（图片以 dataURL 内嵌，避免 file:// 安全限制）；未指定纸型交驱动默认 */
export function renderImageViewerHtml(imageDataUrl: string, paper: PaperSpec | undefined): string {
  if (!paper) {
    return renderTemplate(imageViewerHtml, { imageDataUrl, cssPageSize: 'auto', pageMarginMm: 10 })
  }
  // 统一物理尺寸写法：连续纸高度交由内容自然分页（'auto'）
  const cssPageSize = `${paper.widthMm}mm ${paper.heightMm > 0 ? `${paper.heightMm}mm` : 'auto'}`
  const pageMarginMm = paper.heightMm > 0 ? 10 : 0
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

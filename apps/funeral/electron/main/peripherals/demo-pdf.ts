/**
 * 演示用 PDF 构建器：fh:report:pdf 的 mock 产物（纯 ASCII，Helvetica 单页文本）。
 * 真实接入位：报表服务返回 PDF 流后，本文件可整体删除。
 * 仅含 ASCII 字符——PDF 字符串长度即字节长度，xref 偏移量手工计算保持合法。
 */

import { Buffer } from 'node:buffer'

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/** lines 必须为 ASCII 文本（中文在 Helvetica 下无法编码） */
export function buildDemoPdf(lines: string[]): string {
  const content = [
    'BT',
    '/F1 20 Tf',
    '72 770 Td',
    '32 TL',
    ...lines.flatMap((line, index) => {
      const text = `(${escapePdfText(line)}) Tj`
      return index === 0 ? [text] : ['T*', text]
    }),
    'ET',
  ].join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets)
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(pdf, 'latin1').toString('base64')
}

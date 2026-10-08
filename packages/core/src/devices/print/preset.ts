import type { PrintPreset } from '@desktop/shared'

/**
 * 打印预设出厂库（代码即档案，单一数据源）。
 * 运行时编辑（UI savePreset）持久化到 userData/print-presets（electron-store），启动时作为
 * customPresets 回注 createPrintSystem（按 id 覆盖出厂预设）。
 */
export const BUILT_IN_PRESETS: PrintPreset[] = [
  {
    id: 'preset-receipt80',
    displayName: '收银小票 80mm',
    businessType: 'receipt',
    templateId: 'receipt-default',
    paper: 'receipt80',
    hardware: { cut: 'partial', feedLines: 2 },
    silent: true,
  },
  {
    id: 'preset-receipt58',
    displayName: '收银小票 58mm',
    businessType: 'receipt',
    templateId: 'receipt-default',
    paper: 'receipt58',
    hardware: { cut: 'full', feedLines: 2 },
    silent: true,
  },
  {
    id: 'preset-document-a4',
    displayName: 'A4 文档',
    businessType: 'document',
    templateId: 'document-default',
    paper: 'a4',
    silent: true,
  },
  {
    id: 'preset-label-40x30',
    displayName: '标签 40×30mm',
    businessType: 'label',
    templateId: 'label-default',
    paper: { preset: 'label', widthMm: 40, heightMm: 30 },
    silent: true,
  },
]

/** 出厂 + 运行时自定义合并（自定义 ID 覆盖出厂） */
export function mergePresets(custom?: PrintPreset[]): PrintPreset[] {
  const byId = new Map<string, PrintPreset>()
  for (const p of BUILT_IN_PRESETS) byId.set(p.id, p)
  for (const p of custom ?? []) {
    if (p && p.id)
      byId.set(p.id, p)
  }
  return [...byId.values()]
}

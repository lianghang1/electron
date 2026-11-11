import type { UnifiedPrinter } from '@shell/shared'

/** 打印机名规范化：NFKC 归一 + 去首尾空白 + 折叠连续空白 + 大小写统一。 */
export function canonicalPrinterName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export const VIRTUAL_PRINTER_ID = 'simulated://default'

/** 无硬件通道使用的虚拟打印机：不要求系统安装驱动即可跑通完整任务链路。 */
export function virtualPrinter(printerId?: string): UnifiedPrinter {
  const id = printerId || VIRTUAL_PRINTER_ID
  return {
    id,
    displayName: '仿真打印机',
    source: 'simulated',
    isDefault: true,
    status: 'ready',
    capabilities: {},
    canonicalName: canonicalPrinterName(id),
    meta: { virtual: true },
  }
}

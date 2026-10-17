import type { PrinterCaps, UnifiedPrinter } from '@desktop/shared'
import type { HiddenWindowPool } from './hidden-window'
import type { WinspoolHost } from './system-default'
import { printError } from './errors'
import { detectPrinterHardware, detectPrinterPapers, detectSystemDefaultPrinter } from './system-default'

/** 打印机注册表：枚举系统打印机（getPrintersAsync），业务层只见 UnifiedPrinter。 */
export class PrinterRegistry {
  constructor(
    private readonly windows: HiddenWindowPool,
    /** 设备守护进程窄接口：winspool 同步探测经此进 utility 进程，主进程零阻塞（缺省回退主进程直调） */
    private readonly winspool?: WinspoolHost,
  ) {}

  async list(): Promise<UnifiedPrinter[]> {
    const system = await this.listSystem()
    const hasDefault = system.some(p => p.isDefault)
    if (!hasDefault && system.length > 0) { system[0].isDefault = true }
    return system
  }

  private async listSystem(): Promise<UnifiedPrinter[]> {
    try {
      // getPrintersAsync 只读窗口级 API，走 withUtility 与渲染/打印任务互斥
      const printers = await this.windows.withUtility(win => win.webContents.getPrintersAsync())
      // Electron 37 起 PrinterInfo 不再带 isDefault/status，默认打印机由 OS 查询补充
      const osDefault = await detectSystemDefaultPrinter()
      const mapped = printers.map(p => ({
        id: p.name,
        displayName: p.displayName || p.name,
        source: 'system' as const,
        isDefault: !!osDefault && osDefault === p.name,
        status: 'unknown' as const,
        // 能力保守声明：纸宽未知（不设限）；纸张列表/驱动默认值由下方探测填充
        capabilities: {} as PrinterCaps,
        meta: {
          description: p.description ?? '',
          driver: (p.options as unknown as Record<string, string>)?.['printer-make-and-model'] ?? '',
        },
      }))
      // 设备驱动上报的纸张（Win: winspool；Unix: lpoptions）与打印首选项默认值/能力位，纸型联动与默认值展示以此为准
      await Promise.all(mapped.map(async (p) => {
        p.capabilities.paperList = await detectPrinterPapers(p.id, this.winspool)
        const hw = await detectPrinterHardware(p.id, this.winspool)
        if (hw) {
          p.capabilities.defaults = hw.defaults
          p.capabilities.duplexSupported = hw.duplexSupported
          p.capabilities.colorSupported = hw.colorSupported
        }
      }))
      return mapped
    }
    catch (err) {
      console.error('[print] 枚举系统打印机失败:', err)
      return []
    }
  }

  async resolve(printerId?: string): Promise<UnifiedPrinter> {
    const all = await this.list()
    if (printerId) {
      const found = all.find(p => p.id === printerId)
      if (!found) {
        throw printError('PRINTER_NOT_FOUND', `未找到打印机: ${printerId}`, {
          available: all.map(p => ({ id: p.id, source: p.source })),
        })
      }
      return found
    }
    const fallback = all.find(p => p.isDefault) ?? all[0]
    if (!fallback) {
      throw printError('PRINTER_DEFAULT_MISSING', '系统未检测到任何打印机')
    }
    return fallback
  }
}

import type { PrinterCaps, PrinterPaper, RawPrinterConfig, UnifiedPrinter } from '@desktop/shared'
import type { HiddenWindowPool } from './hidden-window'
import { printError } from './errors'
import { detectPrinterHardware, detectPrinterPapers, detectSystemDefaultPrinter } from './system-default'

/**
 * 打印机注册表：把"系统打印机"（getPrintersAsync）与"网络直连打印机"（装配注入）合并为统一视图。
 * 业务层只见 UnifiedPrinter，不感知来源差异。
 */
export class PrinterRegistry {
  constructor(
    private readonly windows: HiddenWindowPool,
    /** 网络直连打印机档案（装配注入的现场数据：IP/端口/协议） */
    private readonly networkPrinters: RawPrinterConfig[],
  ) {}

  async list(): Promise<UnifiedPrinter[]> {
    const [system, network] = await Promise.all([this.listSystem(), this.listNetwork()])
    const merged = [...system, ...network]
    const hasDefault = merged.some(p => p.isDefault)
    if (!hasDefault && merged.length > 0)
      merged[0].isDefault = true
    return merged
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
        capabilities: systemCaps(),
        meta: {
          description: p.description ?? '',
          driver: (p.options as unknown as Record<string, string>)?.['printer-make-and-model'] ?? '',
        },
      }))
      // 设备驱动上报的纸张（Win: winspool；Unix: lpoptions）与打印首选项默认值/能力位，纸型联动与默认值展示以此为准
      await Promise.all(mapped.map(async (p) => {
        p.capabilities.paperList = await detectPrinterPapers(p.id)
        const hw = await detectPrinterHardware(p.id)
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

  /** 网络直连打印机：TCP 连通性探测（1.2s 超时，结果缓存 15s），状态真实反映可达性 */
  private async listNetwork(): Promise<UnifiedPrinter[]> {
    return Promise.all(
      this.networkPrinters.map(async cfg => ({
        id: cfg.id,
        displayName: cfg.displayName || cfg.id,
        source: 'network' as const,
        isDefault: !!cfg.isDefault,
        // mock 打印机不走网络（指令落盘），视为恒可用
        status: cfg.mock ? ('ready' as const) : await this.probeNetwork(cfg),
        capabilities: {
          cut: true,
          openCashbox: true,
          qrcodeDirect: true,
          barcodeDirect: true,
          maxWidthMm: 80,
          // 无驱动查询通道：纸型数据为空（不伪造），显式提示由 UI 层负责
          paperList: [] as PrinterPaper[],
          ...cfg.capabilities,
        },
        meta: { config: cfg, protocol: cfg.protocol },
      })),
    )
  }

  private probeCache = new Map<string, { at: number, status: UnifiedPrinter['status'] }>()

  private async probeNetwork(cfg: RawPrinterConfig): Promise<UnifiedPrinter['status']> {
    const cached = this.probeCache.get(cfg.id)
    if (cached && Date.now() - cached.at < 15_000)
      return cached.status
    const reachable = await new Promise<boolean>((resolve) => {
      let settled = false
      const done = (v: boolean): void => {
        if (!settled) {
          settled = true
          resolve(v)
        }
      }
      import('node:net')
        .then((net) => {
          const socket = net.createConnection({ host: cfg.transport.host, port: cfg.transport.port }, () => {
            socket.destroy()
            done(true)
          })
          socket.setTimeout(1200)
          socket.on('timeout', () => {
            socket.destroy()
            done(false)
          })
          socket.on('error', () => done(false))
          socket.on('close', () => done(false))
        })
        .catch(() => done(false))
    })
    const status: UnifiedPrinter['status'] = reachable ? 'ready' : 'offline'
    this.probeCache.set(cfg.id, { at: Date.now(), status })
    return status
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
      throw printError('PRINTER_DEFAULT_MISSING', '系统未检测到任何打印机，也未配置网络直连打印机')
    }
    return fallback
  }

  async capabilities(printerId: string): Promise<PrinterCaps> {
    const printer = await this.resolve(printerId)
    return printer.capabilities
  }
}

/** 系统打印机能力保守声明：硬件控制不可用；纸宽未知（不设限） */
function systemCaps(): PrinterCaps {
  return {
    cut: false,
    openCashbox: false,
    qrcodeDirect: false,
    barcodeDirect: false,
  }
}

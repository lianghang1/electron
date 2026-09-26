import type { DevicePrintTicket } from '@desktop/shared'
import type { Logger } from '../logger/logger'
import type { CardReaderDriver, PrinterDriver } from './driver'
import { DesktopError } from '@desktop/shared'
import { handle } from '../ipc/handle'
import { MockCardReaderDriver, MockPrinterDriver } from './mock-driver'

/** 打印 payload 防护上限：单票行数 / 单行长度 / 份数上限 / 每 WebContents 每分钟票数 */
const MAX_LINES = 50
const MAX_LINE_LENGTH = 64
const MAX_COPIES = 5
const PRINT_WINDOW_MS = 60_000
const MAX_PRINTS_PER_WINDOW = 12

/** 硬件驱动注入项：缺省的能力由平台内置 mock 兜底 */
export interface DeviceDrivers {
  cardReader?: CardReaderDriver
  printer?: PrinterDriver
}

/**
 * 设备通用层：device:* 通道的统一入口（读卡器 / 打印机，各 App 复用）。
 * 平台负责契约 handler、payload 校验与打印频控（防注入脚本滥用副作用通道）；
 * 设备差异收敛到 Driver 注入——App 对接真实 SDK 时只提供 Driver 实现。
 */
export class DeviceService {
  private readonly cardReader: CardReaderDriver
  private readonly printer: PrinterDriver
  /** 每 WebContents 的打印时间戳滑窗（频控） */
  private readonly printLog = new Map<number, number[]>()

  constructor(
    drivers: DeviceDrivers,
    private readonly logger: Logger,
  ) {
    this.cardReader = drivers.cardReader ?? new MockCardReaderDriver()
    this.printer = drivers.printer ?? new MockPrinterDriver()
  }

  register(): void {
    handle('device:idcard:read', () => this.cardReader.readIdCard())
    handle('device:printer:print', (event, ticket) => this.print(event.sender.id, ticket))
  }

  dispose(): void {
    this.printLog.clear()
  }

  /** 校验 + 钳制后交 Driver：结构性垃圾直接拒绝，越界数值钳制到上限 */
  private async print(senderId: number, raw: DevicePrintTicket): Promise<void> {
    const ticket = validateTicket(raw)
    assertPrintRate(this.printLog, senderId)
    await this.printer.print(ticket)
    this.logger.info('device ticket printed', {
      senderId,
      lines: ticket.lines.length,
      copies: ticket.copies,
    })
  }
}

function validateTicket(raw: DevicePrintTicket): DevicePrintTicket {
  if (!raw || typeof raw !== 'object')
    throw new DesktopError('IPC_ERROR', 'invalid print ticket')
  const lines = Array.isArray(raw.lines)
    ? raw.lines
        .filter((line): line is string => typeof line === 'string')
        .slice(0, MAX_LINES)
        .map(line => line.slice(0, MAX_LINE_LENGTH))
    : []
  if (lines.length === 0)
    throw new DesktopError('IPC_ERROR', 'print ticket has no content')
  const copies = Math.min(Math.max(Math.floor(Number(raw.copies ?? 1)) || 1, 1), MAX_COPIES)
  const title = typeof raw.title === 'string' ? raw.title.slice(0, 40) : ''
  return { title, lines, copies }
}

function assertPrintRate(printLog: Map<number, number[]>, senderId: number): void {
  const now = Date.now()
  const stamps = (printLog.get(senderId) ?? []).filter(ts => now - ts < PRINT_WINDOW_MS)
  if (stamps.length >= MAX_PRINTS_PER_WINDOW)
    throw new DesktopError('IPC_ERROR', 'print rate limit exceeded')
  stamps.push(now)
  printLog.set(senderId, stamps)
}

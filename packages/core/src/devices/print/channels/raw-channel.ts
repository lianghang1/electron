import type { PaperSpec, RawPrinterConfig, UnifiedPrinter } from '@desktop/shared'
import type { EscposApi } from '../escpos-render'
import type { PreparedJob } from './channel-types'

import type { ChannelOutcome, PrintChannel } from './print-channel'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CharacterSet, PrinterTypes, ThermalPrinter } from 'node-thermal-printer'
import { printError } from '../errors'
import { renderTemplateEscpos } from '../escpos-render'
import { paperToColumns } from '../paper'

/**
 * 指令直写通道：ESC/POS（小票/标签），网络打印机 TCP 9100 免驱动直发。
 * 中文文本：库以 CharacterSet.CHINA（EUC-CN/GB2312）经 iconv-lite 编码，打印机内置字库渲染。
 * mock 模式：不连真机，把生成的指令流落盘（.bin + 十六进制转储），
 * 供无真机环境验证指令正确性；真机到手后把配置里的 mock 改为 false 即可。
 */
export class RawChannel implements PrintChannel {
  readonly id = 'raw' as const

  async execute(job: PreparedJob, printer: UnifiedPrinter): Promise<ChannelOutcome> {
    if (printer.source !== 'network') {
      throw printError('VALIDATION_FAILED', 'raw 通道仅支持网络直连打印机', { printerId: printer.id })
    }
    const cfg = printer.meta.config as RawPrinterConfig | undefined
    if (!cfg) {
      throw printError('VALIDATION_FAILED', '网络打印机缺少通道配置', { printerId: printer.id })
    }
    // 热敏/标签指令流没有"页/双面/方向/边距"概念，显式报错而非静默忽略（'default' 视为未设置）
    const marginSet = job.options.margin !== undefined && job.options.margin !== 'default'
    if (job.options.pages || job.options.duplex || job.options.landscape || marginSet) {
      throw printError('OPTION_UNSUPPORTED', '指令直写通道不支持页码范围/双面/方向/边距参数', {
        printerId: printer.id,
        requested: {
          pages: job.options.pages,
          duplex: job.options.duplex,
          landscape: job.options.landscape,
          margin: job.options.margin,
        },
      })
    }

    // 1) 归一化内容 → ESC/POS 指令字节流（模板无指令渲染器时显式报错）
    let bytes: Uint8Array
    switch (job.content.type) {
      case 'html': {
        const structured = job.content.structured
        if (!structured) {
          throw printError('OPTION_UNSUPPORTED', 'raw 通道需要模板（结构化数据）负载或 raw 指令负载')
        }
        const thermal = this.createPrinter(cfg, job.paper)
        renderTemplateEscpos(asEscposApi(thermal), structured.templateId, structured.data, job.options, job.paper)
        bytes = new Uint8Array(thermal.getBuffer())
        break
      }
      case 'raw': {
        if (job.content.dialect !== 'escpos') {
          throw printError('OPTION_UNSUPPORTED', `raw 通道当前仅支持 escpos 指令负载，收到 ${job.content.dialect}`)
        }
        // raw 负载 = 调用方自带完整指令流，硬件控制需自行编码在指令内
        const hw = job.options.hardware
        if (hw && ((hw.cut && hw.cut !== 'none') || hw.openCashbox || (hw.feedLines ?? 0) > 0)) {
          throw printError('OPTION_UNSUPPORTED', 'raw 指令负载请把切纸/钱箱等控制编入指令流，不支持 options.hardware', {
            printerId: printer.id,
            requested: hw,
          })
        }
        bytes = job.content.bytes
        break
      }
      case 'pdf':
        throw printError('OPTION_UNSUPPORTED', 'raw 通道不支持 PDF 内容，请改用系统队列通道或指令模板')
    }

    // 2) 发送：mock 落盘 或 TCP 直发
    if (cfg.mock) {
      const dir = cfg.mockOutputDir ?? path.join('out', 'mock-print')
      await mkdir(dir, { recursive: true })
      const binPath = path.join(dir, `${job.jobId}.bin`)
      await writeFile(binPath, bytes)
      const hexPath = path.join(dir, `${job.jobId}.hex.txt`)
      await writeFile(hexPath, hexDump(bytes))
      return { detail: { mock: true, binPath, hexPath, bytes: bytes.byteLength, dialect: 'escpos' } }
    }

    await writeRawSocket(cfg, bytes)
    return { detail: { via: 'tcp-raw', bytes: bytes.byteLength, dialect: 'escpos' } }
  }

  private createPrinter(cfg: RawPrinterConfig, paper: PaperSpec | undefined): ThermalPrinter {
    return new ThermalPrinter({
      type: cfg.protocol === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
      // mock 模式不连接设备，interface 仅为满足构造签名（该路径只构建缓冲不发送）
      interface: cfg.mock ? '' : `tcp://${cfg.transport.host}:${cfg.transport.port}`,
      characterSet: CharacterSet.CHINA,
      removeSpecialCharacters: false,
      width: paperToColumns(paper),
      options: { timeout: 5000 },
    })
  }
}

async function writeRawSocket(cfg: RawPrinterConfig, bytes: Uint8Array): Promise<void> {
  const net = await import('node:net')
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host: cfg.transport.host, port: cfg.transport.port }, () => {
      socket.setTimeout(0) // 连接成功后取消超时，发送即完成
      socket.end(Buffer.from(bytes))
    })
    // 连接阶段 5s 超时：避免死 IP 挂到 OS 级 TCP 超时（几十秒）
    socket.setTimeout(5000)
    socket.on('timeout', () => {
      socket.destroy()
      reject(
        printError('PRINTER_OFFLINE', `连接打印机超时(5s): ${cfg.transport.host}:${cfg.transport.port}`, {
          host: cfg.transport.host,
          port: cfg.transport.port,
        }),
      )
    })
    socket.on('close', () => resolve())
    socket.on('error', (err) => {
      socket.destroy()
      reject(
        printError('PRINTER_OFFLINE', `连接打印机失败: ${err.message}`, {
          host: cfg.transport.host,
          port: cfg.transport.port,
        }),
      )
    })
  })
}

/** 让 ThermalPrinter 满足 EscposApi 最小接口（方法名一一对应，仅收窄） */
function asEscposApi(p: ThermalPrinter): EscposApi {
  // d.ts 声明为 printQRCode，运行时实际是 printQR（库类型声明漂移），故走显式 cast
  const qr = p as unknown as { printQR: (data: string, settings?: unknown) => void }
  return {
    alignLeft: () => p.alignLeft(),
    alignCenter: () => p.alignCenter(),
    alignRight: () => p.alignRight(),
    bold: on => p.bold(on),
    setTextSize: (w, h) => p.setTextSize(w, h),
    println: t => p.println(t),
    newLine: () => p.newLine(),
    printQRCode: d => qr.printQR(d),
    printBarcode: d => p.printBarcode(d),
    cutPartial: () => p.partialCut(),
    cut: () => p.cut(),
    openCashDrawer: () => p.openCashDrawer(),
  }
}

function hexDump(bytes: Uint8Array): string {
  const lines: string[] = []
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = [...bytes.slice(i, i + 16)]
    const hex = chunk.map(b => b.toString(16).padStart(2, '0')).join(' ')
    const ascii = chunk.map(b => (b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.')).join('')
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(48)}  ${ascii}`)
  }
  return lines.join('\n')
}

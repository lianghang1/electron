import { describe, expect, it } from 'vitest'
import { canonicalPrinterName, VIRTUAL_PRINTER_ID, virtualPrinter } from './printer-name'

describe('打印机名规范化与虚拟打印机', () => {
  it('大小写、空白与全半角差异归一到同一标识', () => {
    expect(canonicalPrinterName('  HP   LaserJet  ')).toBe('hp laserjet')
    expect(canonicalPrinterName('ＨＰ LaserJet')).toBe('hp laserjet')
    expect(canonicalPrinterName('hp laserjet')).toBe(canonicalPrinterName('HP  LASERJET'))
  })

  it('空名与纯空白归一头为空串', () => {
    expect(canonicalPrinterName('   ')).toBe('')
  })

  it('虚拟打印机无需驱动即就绪', () => {
    const p = virtualPrinter()
    expect(p.id).toBe(VIRTUAL_PRINTER_ID)
    expect(p.source).toBe('simulated')
    expect(p.status).toBe('ready')
    expect(p.isDefault).toBe(true)
    expect(p.canonicalName).toBe(canonicalPrinterName(VIRTUAL_PRINTER_ID))
    expect(p.meta.virtual).toBe(true)
  })

  it('虚拟打印机可携带调用方给的打印机名', () => {
    const p = virtualPrinter('Office-Printer')
    expect(p.id).toBe('Office-Printer')
    expect(p.canonicalName).toBe('office-printer')
  })
})

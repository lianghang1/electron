import type { DeviceIdCard, DevicePrintTicket } from '@desktop/shared'
import type { CardReaderDriver, PrinterDriver } from './driver'

/** mock 读卡数据：验证读卡 → 业务查询的完整链路（不区分行业场景） */
const MOCK_CARD: DeviceIdCard = {
  name: '李桂芳',
  idNumber: '110101196203054567',
  gender: '女',
  birthDate: '1962-03-05',
}

/** mock 读卡器：每次返回同一张模拟卡 */
export class MockCardReaderDriver implements CardReaderDriver {
  readIdCard(): DeviceIdCard | null {
    return MOCK_CARD
  }
}

/** mock 打印机：模拟出纸耗时（约每张热敏票据 800ms），resolve 即代表出纸完成 */
export class MockPrinterDriver implements PrinterDriver {
  print(ticket: DevicePrintTicket): Promise<void> {
    const copies = ticket.copies ?? 1
    return new Promise((resolve) => {
      setTimeout(resolve, copies * 800)
    })
  }
}

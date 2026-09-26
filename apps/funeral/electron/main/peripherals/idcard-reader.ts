import type { DeviceIdCard } from '@desktop/shared'
import { handle } from '@desktop/core'

/** mock 读卡数据（家属身份证）：验证读卡 → 业务查询的完整链路 */
const MOCK_CARD: DeviceIdCard = {
  name: '李桂芳',
  idNumber: '110101196203054567',
  gender: '女',
  birthDate: '1962-03-05',
}

/**
 * 身份证读卡服务（mock）。
 *
 * 真实接入位：替换 readCard 为厂商 SDK 读卡调用（同步 API 直接返回；
 * 事件驱动型 SDK 在此处轮询/订阅后按需返回最近一次读卡结果）。
 * 契约（device:idcard:read）与注册代码不变，业务页无感。
 */
export function registerIdCardReader(): void {
  handle('device:idcard:read', () => readCard())
}

function readCard(): DeviceIdCard | null {
  return MOCK_CARD
}

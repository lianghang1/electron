import { createDomainApi } from '@desktop/shared'
import { funeralKioskDomain } from '@shared/types/ipc'

/**
 * Kiosk 自有业务 API：由域契约直接生成的类型化收口。
 * 通道 / 入参 / 返回值类型全部由 funeralKioskDomain 推导；
 * 白名单在 electron/preload/index.ts 声明，Main 实现在 electron/main/business.ts。
 */
export const kioskApi = createDomainApi(funeralKioskDomain)

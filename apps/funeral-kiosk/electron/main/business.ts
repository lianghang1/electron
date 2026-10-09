import type { FuneralKioskIpc } from '../../shared/types/ipc'
import { createHandle } from '@desktop/core'
import { funeralKioskDomain } from '../../shared/types/ipc'

/** 业务通道包装：channel / 入参 / 返回值全部受 FuneralKioskIpc 契约约束 */
const handle = createHandle<FuneralKioskIpc>()

/**
 * Kiosk 自有业务通道注册（bootstrap 之后调用）。
 * 契约单一来源：shared/types/ipc（funeralKioskDomain）；
 * 通道白名单在 electron/preload/index.ts 由同一域值生成，三方天然一致。
 */
export function registerKioskBusiness(): void {
  handle(funeralKioskDomain.channels.login, async () => {
    // 登录实现位
    throw new Error('funeral-kiosk:login 未实现')
  })
}

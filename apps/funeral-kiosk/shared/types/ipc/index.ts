import type { DomainIpc } from '@desktop/shared'

import { defineDomain, invoke } from '@desktop/shared'

export const funeralKioskDomain = defineDomain('funeral-kiosk', {
  login: invoke<() => { token: string, tokenType?: string }>(),
})

export type FuneralKioskIpc = DomainIpc<typeof funeralKioskDomain>

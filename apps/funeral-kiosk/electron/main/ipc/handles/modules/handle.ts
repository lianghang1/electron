import type { FuneralKioskIpc } from '@shared/types/ipc'
import { createHandle } from '@desktop/core'

export { funeralKioskDomain } from '@shared/types/ipc'

export const handle = createHandle<FuneralKioskIpc>()

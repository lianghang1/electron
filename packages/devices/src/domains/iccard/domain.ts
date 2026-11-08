import type { DomainDefinition } from '@shell/shared'
import type { IcCardSystem } from './index'
import { defineDomain } from '@shell/shared'
import { z } from 'zod'
import { pickReady } from '../../domain-kit'
import { iccardConfigInput, iccardReadInput, iccardWriteInput, iccardWriteTextsInput, noInput } from '../input-schemas'

/** iccard 域：M1 IC 卡读写。 */
export function createIccardDomain(iccard: IcCardSystem): DomainDefinition {
  return defineDomain('iccard', {
    listReaders: {
      input: noInput,
      output: z.unknown(),
      handler: () => iccard.listReaders(),
    },
    readIc: {
      input: iccardReadInput,
      output: z.unknown(),
      handler: async (input) => {
        const deviceId = input.deviceId
          ?? await pickReady(await iccard.listReaders(), 'IC 卡读写器')
        return iccard.readIc({ ...input, deviceId })
      },
    },
    writeIc: {
      input: iccardWriteInput,
      output: z.unknown(),
      handler: async (input) => {
        const deviceId = input.deviceId
          ?? await pickReady(await iccard.listReaders(), 'IC 卡读写器')
        return iccard.writeIc({ ...input, deviceId })
      },
    },
    writeIcTexts: {
      input: iccardWriteTextsInput,
      output: z.unknown(),
      handler: async (input) => {
        const deviceId = input.deviceId
          ?? await pickReady(await iccard.listReaders(), 'IC 卡读写器')
        return iccard.writeIcTexts({ ...input, deviceId })
      },
    },
    getConfig: {
      input: noInput,
      output: z.unknown(),
      handler: () => iccard.getConfig(),
    },
    setConfig: {
      input: iccardConfigInput,
      output: z.unknown(),
      handler: ({ id, overrides }) => iccard.setConfig(id, overrides),
    },
  })
}

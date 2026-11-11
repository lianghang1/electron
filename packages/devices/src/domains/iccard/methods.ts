import type { DomainDefinition } from '@shell/shared'
import type { IcCardSystem } from './index'
import { z } from 'zod'
import { pickReady } from '../../domain-kit'
import { iccardConfigInput, iccardReadInput, iccardWriteInput, iccardWriteTextsInput, noInput } from '../input-schemas'

/** iccard 域：M1 IC 卡读写。 */

export function createIccardMethods(iccard: IcCardSystem): DomainDefinition['methods'] {
  return {
    listDevices: {
      input: noInput,
      output: z.unknown(),
      handler: () => iccard.listDevices(),
    },
    readSector: {
      input: iccardReadInput,
      output: z.unknown(),
      handler: async ({ deviceId: requested, sectorKey, keyType, sectorNumber }) => {
        const deviceId = requested
          ?? await pickReady(await iccard.listDevices(), 'IC 卡读写器')
        return iccard.readSector({ deviceId, key: sectorKey, keyType, sector: sectorNumber })
      },
    },
    writeSector: {
      input: iccardWriteInput,
      output: z.unknown(),
      handler: async ({ deviceId: requested, blockNumber, blockData, sectorKey, keyType }) => {
        const deviceId = requested
          ?? await pickReady(await iccard.listDevices(), 'IC 卡读写器')
        return iccard.writeSector({ deviceId, block: blockNumber, data: blockData, key: sectorKey, keyType })
      },
    },
    writeTextBlocks: {
      input: iccardWriteTextsInput,
      output: z.unknown(),
      handler: async ({ deviceId: requested, sectorNumber, textBlocks, sectorKey, keyType }) => {
        const deviceId = requested
          ?? await pickReady(await iccard.listDevices(), 'IC 卡读写器')
        return iccard.writeTextBlocks({ deviceId, sector: sectorNumber, texts: textBlocks, key: sectorKey, keyType })
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
      handler: ({ deviceProfileId, overrides }) => iccard.setConfig(deviceProfileId, overrides),
    },
  }
}

import type { DomainDefinition } from '@shell/shared'
import type { IdCardSystem } from './index'
import { z } from 'zod'
import { pickReady } from '../../domain-kit'
import { idcardConfigInput, idcardReadInput, noInput } from '../input-schemas'

/** idcard 域：身份证阅读器。域自描述，gateway 只查表收集。 */

export function createIdcardMethods(idcard: IdCardSystem): DomainDefinition['methods'] {
  return {
    listDevices: {
      input: noInput,
      output: z.unknown(),
      handler: () => idcard.listDevices(),
    },
    readCard: {
      input: idcardReadInput,
      output: z.unknown(),
      handler: async (input) => {
        const deviceId = input.deviceId
          ?? await pickReady(await idcard.listDevices(), '身份证阅读器')
        return idcard.readCard({ deviceId })
      },
    },
    getConfig: {
      input: noInput,
      output: z.unknown(),
      handler: () => idcard.getConfig(),
    },
    setConfig: {
      input: idcardConfigInput,
      output: z.unknown(),
      handler: ({ deviceProfileId, overrides }) => idcard.setConfig(deviceProfileId, overrides),
    },
  }
}

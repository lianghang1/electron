import type { DomainDefinition } from '@shell/shared'
import type { IdCardSystem } from './index'
import { defineDomain } from '@shell/shared'
import { z } from 'zod'
import { pickReady } from '../../domain-kit'
import { idcardConfigInput, idcardReadInput, noInput } from '../input-schemas'

/** idcard 域：身份证阅读器。域自描述，gateway 只查表收集。 */
export function createIdcardDomain(idcard: IdCardSystem): DomainDefinition {
  return defineDomain('idcard', {
    listReaders: {
      input: noInput,
      output: z.unknown(),
      handler: () => idcard.listReaders(),
    },
    read: {
      input: idcardReadInput,
      output: z.unknown(),
      handler: async (input) => {
        const deviceId = input.deviceId
          ?? await pickReady(await idcard.listReaders(), '身份证阅读器')
        return idcard.read({ deviceId })
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
      handler: ({ id, overrides }) => idcard.setConfig(id, overrides),
    },
  })
}

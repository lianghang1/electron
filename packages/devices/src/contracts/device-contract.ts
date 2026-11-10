import type { DomainDefinition } from '@shell/shared'
/**
 * 设备对外能力契约：重构前后共同的重放基准。
 *
 * 能力用稳定 id 标识，与对外方法名解耦。旧名/新名都只是同一能力的两个书写形式，
 * 由 PHASE 决定当前生效哪一个。输入样例锁住校验边界（合法通过 / 越界拒绝），
 * 因此改名之后能力数量、语义与约束必须逐项一致。
 */
import type { z } from 'zod'
import type { DomainDeps } from '../domain-kit'
import { createCaptureDomain } from '../domains/capture/domain'
import { createIccardDomain } from '../domains/iccard/domain'
import { createIdcardDomain } from '../domains/idcard/domain'
import { createPrintDomain } from '../domains/print/domain'
import { createScannerDomain } from '../domains/scanner/domain'
import { createSignatureDomain } from '../domains/signature/domain'

/** legacy = 现状对外名；target = 定稿名。切换只改这一处常量。 */
export const CONTRACT_PHASE = 'legacy' as const
export type ContractPhase = 'legacy' | 'target'

export interface CapabilityContract {
  /** 稳定能力标识，永不随命名变化 */
  readonly id: string
  readonly legacyName: string
  readonly targetName: string
  /** 合法入参：必须被 schema 接受 */
  readonly accepted: readonly unknown[]
  /** 非法入参：必须被 schema 拒绝 */
  readonly rejected?: readonly unknown[]
}

const NO_INPUT = undefined

/**
 * 38 项对外能力。id 采用 `<域>:<动作>`，动作是业务语义而非实现细节。
 * accepted/rejected 同时锁住参数改名后的字段集合与范围约束。
 */
export const CAPABILITIES: readonly CapabilityContract[] = [
  // print
  { id: 'print:submit', legacyName: 'print.submit', targetName: 'print.submitPrintJob', accepted: [{ payload: { kind: 'html', html: '<p>a</p>' }, options: { paper: 'A4' } }], rejected: [{ payload: { kind: 'file', path: 'a\u0000b' }, options: { paper: 'A4' } }, { payload: { kind: 'html', html: '' }, options: { paper: 'A4' } }] },
  { id: 'print:listDevices', legacyName: 'print.listPrinters', targetName: 'print.listDevices', accepted: [NO_INPUT] },
  { id: 'print:getJobStatus', legacyName: 'print.status', targetName: 'print.getJobStatus', accepted: [{ jobId: 'j1' }], rejected: [{ jobId: '' }] },
  { id: 'print:listJobs', legacyName: 'print.listJobs', targetName: 'print.listPrintJobs', accepted: [NO_INPUT, { limit: 5 }], rejected: [{ limit: 0 }] },
  { id: 'print:removeJob', legacyName: 'print.removeJob', targetName: 'print.removePrintJob', accepted: [{ jobId: 'j1' }], rejected: [{ jobId: '' }] },
  { id: 'print:clearJobs', legacyName: 'print.clearJobs', targetName: 'print.clearPrintJobs', accepted: [NO_INPUT] },
  { id: 'print:reprintJob', legacyName: 'print.reprint', targetName: 'print.reprintJob', accepted: [{ jobId: 'j1' }], rejected: [{ jobId: '' }] },

  // capture
  { id: 'capture:listDevices', legacyName: 'capture.listDevices', targetName: 'capture.listDevices', accepted: [NO_INPUT] },
  { id: 'capture:listConfigs', legacyName: 'capture.getConfigs', targetName: 'capture.listDeviceConfigs', accepted: [NO_INPUT] },
  { id: 'capture:setConfig', legacyName: 'capture.setConfig', targetName: 'capture.setConfig', accepted: [{ id: 'd1', overrides: { displayName: 'cam' } }], rejected: [{ id: '', overrides: {} }] },
  { id: 'capture:getDefaultDevice', legacyName: 'capture.getDefaultDevice', targetName: 'capture.getDefaultDevice', accepted: [NO_INPUT] },
  { id: 'capture:setDefaultDevice', legacyName: 'capture.setDefaultDevice', targetName: 'capture.setDefaultDevice', accepted: [{ id: 'd1' }, { id: null }], rejected: [{ id: 3 }] },
  { id: 'capture:resolveDefaultDevice', legacyName: 'capture.resolveDefaultDevice', targetName: 'capture.findDefaultDevice', accepted: [NO_INPUT] },
  { id: 'capture:captureImage', legacyName: 'capture.capture', targetName: 'capture.captureImage', accepted: [{}, { deviceId: 'd1', format: 'jpg', resolutionNum: 300 }], rejected: [{ format: 'gif' }] },
  { id: 'capture:saveCapturedImage', legacyName: 'capture.saveDataUrl', targetName: 'capture.saveCapturedImage', accepted: [{ dataUrl: 'data:image/png;base64,AA', ext: 'png' }], rejected: [{ dataUrl: '' }] },
  { id: 'capture:startPreview', legacyName: 'capture.startPreview', targetName: 'capture.startPreview', accepted: [{}, { deviceId: 'd1' }] },
  { id: 'capture:stopPreview', legacyName: 'capture.stopPreview', targetName: 'capture.stopPreview', accepted: [{ deviceId: 'd1' }], rejected: [{ deviceId: '' }] },
  { id: 'capture:listDeviceCameras', legacyName: 'capture.listCameras', targetName: 'capture.listDeviceCameras', accepted: [{}, { deviceId: 'd1' }] },

  // idcard
  { id: 'idcard:listDevices', legacyName: 'idcard.listReaders', targetName: 'idcard.listDevices', accepted: [NO_INPUT] },
  { id: 'idcard:readCard', legacyName: 'idcard.read', targetName: 'idcard.readCard', accepted: [{}, { deviceId: 'r1' }] },
  { id: 'idcard:getConfig', legacyName: 'idcard.getConfig', targetName: 'idcard.getConfig', accepted: [NO_INPUT] },
  { id: 'idcard:setConfig', legacyName: 'idcard.setConfig', targetName: 'idcard.setConfig', accepted: [{ id: 'r1', overrides: { displayName: 'reader' } }], rejected: [{ id: '', overrides: {} }] },

  // iccard
  { id: 'iccard:listDevices', legacyName: 'iccard.listReaders', targetName: 'iccard.listDevices', accepted: [NO_INPUT] },
  { id: 'iccard:readSector', legacyName: 'iccard.readIc', targetName: 'iccard.readSector', accepted: [{ sector: 1 }, { deviceId: 'r1', sector: 15, key: 'ffffffffffff', keyType: 'A' }], rejected: [{ sector: 16 }, { key: 'zzzzzzzzzzzz' }] },
  { id: 'iccard:writeSector', legacyName: 'iccard.writeIc', targetName: 'iccard.writeSector', accepted: [{ block: 4, data: '0'.repeat(32) }], rejected: [{ block: 64, data: '0'.repeat(32) }, { block: 4, data: 'abc' }] },
  { id: 'iccard:writeTextBlocks', legacyName: 'iccard.writeIcTexts', targetName: 'iccard.writeTextBlocks', accepted: [{ sector: 1, texts: ['hello'] }], rejected: [{ sector: 16, texts: ['x'] }, { sector: 1, texts: [] }] },
  { id: 'iccard:getConfig', legacyName: 'iccard.getConfig', targetName: 'iccard.getConfig', accepted: [NO_INPUT] },
  { id: 'iccard:setConfig', legacyName: 'iccard.setConfig', targetName: 'iccard.setConfig', accepted: [{ id: 'r1', overrides: {} }], rejected: [{ id: '', overrides: {} }] },

  // scanner
  { id: 'scanner:getConfig', legacyName: 'scanner.getConfig', targetName: 'scanner.getConfig', accepted: [NO_INPUT] },
  { id: 'scanner:setConfig', legacyName: 'scanner.setConfig', targetName: 'scanner.setConfig', accepted: [{ enabled: true, activeId: 'a1', deviceId: 'd1', overrides: { minLength: 4 } }], rejected: [{ enabled: 'yes', activeId: 'a1', deviceId: 'd1', overrides: {} }] },
  { id: 'scanner:simulateScan', legacyName: 'scanner.simulate', targetName: 'scanner.simulateScan', accepted: [{ code: 'EAN-1' }], rejected: [{ code: '' }] },

  // signature
  { id: 'signature:listDevices', legacyName: 'signature.listDevices', targetName: 'signature.listDevices', accepted: [NO_INPUT] },
  { id: 'signature:startSigning', legacyName: 'signature.start', targetName: 'signature.startSigning', accepted: [NO_INPUT, { deviceId: 's1' }] },
  { id: 'signature:stopSigning', legacyName: 'signature.stop', targetName: 'signature.stopSigning', accepted: [NO_INPUT] },
  { id: 'signature:clearSignature', legacyName: 'signature.clear', targetName: 'signature.clearSignature', accepted: [NO_INPUT] },
  { id: 'signature:cancelSigning', legacyName: 'signature.cancel', targetName: 'signature.cancelSigning', accepted: [NO_INPUT] },
  { id: 'signature:getConfig', legacyName: 'signature.getConfig', targetName: 'signature.getConfig', accepted: [NO_INPUT] },
  { id: 'signature:setConfig', legacyName: 'signature.setConfig', targetName: 'signature.setConfig', accepted: [{ id: 's1', overrides: {} }], rejected: [{ id: '', overrides: {} }] },
]

export function activeName(c: CapabilityContract, phase: ContractPhase = CONTRACT_PHASE): string {
  return phase === 'target' ? c.targetName : c.legacyName
}

export const RENAME_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  CAPABILITIES.map(c => [c.legacyName, c.targetName]),
)

/** 参数改名表：schema 字段名 → 定稿字段名。P2 执行全量切换。 */
export const FIELD_RENAME_MAP: Readonly<Record<string, string>> = {
  'payload': 'printContent',
  'options': 'printOptions',
  'resolutionNum': 'resolution',
  'key': 'sectorKey',
  'block': 'blockNumber',
  'data': 'blockData',
  'camId': 'cameraId',
  'wake.command': 'wakeCommand',
  'endKey': 'terminatorKey',
  'requirePrefix': 'prefixRequired',
  'activeId': 'activeProfileId',
  'dataUrl': 'imageDataUrl',
  'ext': 'imageExtension',
  'code': 'scannedCode',
  'texts': 'textBlocks',
  'path': 'filePath',
  'html': 'htmlContent',
  'url': 'sourceUrl',
  'paper': 'paperName',
  'format': 'imageFormat',
  'limit': 'maxCount',
  'jobId': 'printJobId',
  'sector': 'sectorNumber',
  'deviceId': 'deviceId',
  'overrides': 'overrides',
  'id': 'deviceId',
  'displayName': 'displayName',
  'enabled': 'enabled',
}

/** 用无害桩构造六个域定义：只需要方法表与 schema，不触发任何设备调用。 */
export function buildDomainDefinitions(): DomainDefinition[] {
  const stub = new Proxy({}, { get: () => async () => ({}) })
  const print = stub as Parameters<typeof createPrintDomain>[0]
  const capture = stub as Parameters<typeof createCaptureDomain>[0]
  const idcard = stub as Parameters<typeof createIdcardDomain>[0]
  const iccard = stub as Parameters<typeof createIccardDomain>[0]
  const scanner = stub as Parameters<typeof createScannerDomain>[0]
  const signature = stub as Parameters<typeof createSignatureDomain>[0]
  const eventBus = new Proxy({}, { get: () => () => {} }) as DomainDeps['events']
  const deps: DomainDeps = { events: eventBus, diagnostics: true }
  return [
    createPrintDomain(print),
    createCaptureDomain(capture, deps),
    createIdcardDomain(idcard),
    createIccardDomain(iccard),
    createScannerDomain(scanner, deps),
    createSignatureDomain(signature, deps),
  ]
}

export function collectMethodSchemas(): Map<string, z.ZodTypeAny> {
  const out = new Map<string, z.ZodTypeAny>()
  for (const def of buildDomainDefinitions()) {
    for (const [name, method] of Object.entries(def.methods)) {
      out.set(`${def.name}.${name}`, method.input)
    }
  }
  return out
}

import { defineDomain } from '../../../domain'
import { captureDomainDefs } from './capture'
import { idCardDomainDefs } from './idcard'
import { printDomainDefs } from './print'
import { scannerDomainDefs } from './scanner'
import { signatureDomainDefs } from './signature'

/**
 * 设备域契约：外设硬件通道（读卡器 / 打印机 / 扫码枪 / 摄像头 / 签名板…）。
 * idcard / signature 聚合进各自域（DesktopApi.device / .signature 分组）；
 * scanner / capture / print 是独立原子域（通道量大、职责独立，各自一个 DesktopApi 分组）。
 * handler 由 core 设备服务注册：缺省内置 mock/stub，宿主经 bootstrap.devices 配置真实资源。
 */
export const deviceDomain = defineDomain('device', {
  ...idCardDomainDefs,
})

export const signatureDomain = defineDomain('signature', signatureDomainDefs)

export const scannerDomain = defineDomain('scanner', scannerDomainDefs)

export const captureDomain = defineDomain('capture', captureDomainDefs)

export const printDomain = defineDomain('print', printDomainDefs)

import { defineDomain } from '../../../domain'
import { captureDomainDefs } from './capture'
import { iccardDomainDefs } from './iccard'
import { idcardDomainDefs } from './idcard'
import { printDomainDefs } from './print'
import { scannerDomainDefs } from './scanner'
import { signatureDomainDefs } from './signature'

/**
 * 设备域契约：外设硬件通道（读卡器 / 打印机 / 扫码枪 / 摄像头 / 签名板…）。
 * idcard（身份证）/ iccard（IC 卡）/ signature / scanner / capture / print 均为独立原子域
 * （按设备类型一文件，各自一个 DesktopApi 分组）。
 * handler 由 core 设备服务注册：宿主经 bootstrap.devices 配置真实资源。
 */
export const idcardDomain = defineDomain('idcard', idcardDomainDefs)

export const iccardDomain = defineDomain('iccard', iccardDomainDefs)

export const signatureDomain = defineDomain('signature', signatureDomainDefs)

export const scannerDomain = defineDomain('scanner', scannerDomainDefs)

export const captureDomain = defineDomain('capture', captureDomainDefs)

export const printDomain = defineDomain('print', printDomainDefs)

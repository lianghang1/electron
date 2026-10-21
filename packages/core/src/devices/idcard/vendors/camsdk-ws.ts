import type { IdCardData } from '@desktop/shared'
import { parseWsUrl, tcpProbe, withWsSession } from '../../kernel/channel/ws-channel'
import { idCardError } from '../errors'
import { normalizeCardDate } from './card-date'

/**
 * CamSDKServer 身份证读卡厂商模块（ws 路线，to:1 转发多功能终端服务处理）。
 * CamSDK = 华夏电通「华夏扫描中间件」（本地服务 CamSDKServer，ws://127.0.0.1:9000），
 * 支持多厂商外设经同一 JSON 帧协议代理（含华视读卡器等）。
 * 帧协议与 capture 域 camsdk 同源：JSON 文本帧 {func, reqId, ...} → {func, reqId, result, errorMsg?}。
 * 协议依据：CamSDK《接口通用标准规范.pdf》ReadIDCardInfo 章节 + 官方 demo Ext-Dev/W7/HS/JS/IdCard.js。
 * 能力约束：无读卡器枚举 API —— 可用性判定以服务探活为准（读卡授权已真机实测通过，result=65 等证超时即授权链路正常）。
 * PII 红线：证件照片 base64 只经内存传递，不落日志。
 */

/** CamSDK ws 读卡出厂配置（单一数据源；服务地址变更时改此处） */
export const CAMSDK_WS_READER = {
  url: 'ws://127.0.0.1:9000',
  id: 'ws:camsdk',
  brand: 'CamSDK',
  displayName: 'CamSDK 身份证读卡（本地服务 9000）',
} as const

/** ReadIDCardInfo 响应帧（idType=0 身份证部分；其余字段随固件版本有出入，只取消费的字段） */
interface CamSdkIdCardFrame {
  func?: string
  result?: number
  errorMsg?: string
  cardInfo?: {
    id?: string
    name?: string
    folk?: string
    gender?: string
    address?: string
    birth?: string
    startDate?: string
    endDate?: string
    imageBase64?: string
    mime?: string
    issue?: string
  }
  [key: string]: unknown
}

/** 解析 CamSDK JSON 文本帧（二进制帧/非法 JSON 返回 null，调用方忽略） */
function parseFrame(data: unknown): CamSdkIdCardFrame | null {
  if (typeof data !== 'string') {
    return null
  }
  try {
    return JSON.parse(data) as CamSdkIdCardFrame
  }
  catch {
    return null
  }
}

/** cardInfo（终端字段命名）→ 契约 IdCardData（日期归一化 YYYY-MM-DD） */
function toIdCardData(card: NonNullable<CamSdkIdCardFrame['cardInfo']>): IdCardData {
  const photo = card.imageBase64 ? `data:${card.mime ?? 'image/jpeg'};base64,${card.imageBase64}` : undefined
  return {
    name: card.name ?? '',
    idNumber: card.id ?? '',
    gender: card.gender ?? '',
    nation: card.folk ?? '',
    birthDate: normalizeCardDate(card.birth ?? ''),
    address: card.address ?? '',
    issuer: card.issue ?? '',
    validFrom: normalizeCardDate(card.startDate ?? ''),
    validTo: normalizeCardDate(card.endDate ?? ''),
    ...(photo ? { photoDataUrl: photo } : {}),
  }
}

/** 读一张证卡：连接 → ReadIDCardInfo（服务侧等证，刷卡后返回）→ cardInfo */
export function readIdCardViaCamSdk(url: string): Promise<IdCardData> {
  return withWsSession<IdCardData>(url, {
    timeoutMs: 30000,
    onTimeout: () => idCardError('READ_FAILED', '读卡超时（请将身份证平放到读卡区后重试）'),
    onConnectError: url => idCardError('DEVICE_OFFLINE', `CamSDKServer 连接失败: ${url}（确认已安装 CamSDK 且服务运行中）`),
    onClosedEarly: () => idCardError('DEVICE_OFFLINE', '连接在证件读取完成前关闭'),
    run: (ws) => {
      ws.send(JSON.stringify({ func: 'ReadIDCardInfo', to: 1, idType: 0, mode: 'base64', reqId: String(Date.now()) }))
    },
    onMessage: (ev, _ws, settle) => {
      const msg = parseFrame(ev.data)
      if (!msg || msg.func !== 'ReadIDCardInfo') {
        return
      }
      if (msg.result !== 0) {
        settle(idCardError('READ_FAILED', `证件读取失败：${String(msg.errorMsg ?? `错误码 ${String(msg.result)}`)}`))
        return
      }
      if (!msg.cardInfo) {
        settle(idCardError('READ_FAILED', '证件读取成功但未返回证件数据'))
        return
      }
      settle(undefined, toIdCardData(msg.cardInfo))
    },
  })
}

/** 服务探活（无读卡器枚举 API，可用性以服务可达为界） */
export async function probeCamSdkReader(url: string): Promise<boolean> {
  const { host, port } = parseWsUrl(url)
  return tcpProbe(host, port)
}

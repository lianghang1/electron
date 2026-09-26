/**
 * 殡仪馆自助终端（apps/funeral）业务类型：App 本地，不进平台包（@desktop/shared）。
 * 业务接口（殡仪馆业务系统/支付/发票）对接前以 mock 实现，形态即最终契约。
 */

/** 自助机业务配置：部署时按机器写 userData/config.json 覆盖默认值 */
export interface FhBusinessConfig {
  /** 机器编号（运维定位 / 监控标识） */
  machineId: string
  /** 馆名（页眉展示） */
  hallName: string
  /** 院内服务器地址（热更 feed / 上报，未配置用构建内置默认） */
  serverUrl?: string
}

/** 业务单（代收费）：家属办理业务产生的待缴费单 */
export interface FhOrder {
  orderNo: string
  /** 逝者姓名（区分多笔业务） */
  deceasedName: string
  /** 服务项目明细 */
  items: string[]
  /** 应收金额（元） */
  amount: number
  status: 'unpaid' | 'paid'
  /** 是否已开发票 */
  invoiced: boolean
}

/** 发票抬头 */
export interface FhInvoiceTitle {
  type: 'person' | 'company'
  /** 抬头名称（个人为姓名，单位为企业全称） */
  name: string
  /** 纳税人识别号（单位抬头必填） */
  taxId?: string
  /** 接收电子发票的邮箱 */
  email?: string
}

/** 发票 */
export interface FhInvoice {
  invoiceNo: string
  title: FhInvoiceTitle
  orderNo: string
  amount: number
  /** 开票时间 */
  issuedAt: string
}

/** 订单/发票查询凭据：业务单条码（扫码）或家属身份证号（刷卡/手动输入） */
export interface FhQuery {
  code?: string
  idNumber?: string
}

/** 支付会话：创建后展示二维码，renderer 轮询状态 */
export interface FhPaySession {
  orderNo: string
  /** 支付二维码内容（真实部署为微信/支付宝 Native 下单返回的 codeUrl） */
  qrContent: string
  /** 二维码有效期（秒） */
  expiresIn: number
}

export type FhPayStatus = 'pending' | 'paid' | 'expired'

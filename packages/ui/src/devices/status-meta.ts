import type { ConfigDeviceStatus } from '../capture/use-capture-config'

/**
 * 设备状态徽标元数据：文案 + 软底色。
 * 系统设置各设备面板（拍摄/身份证/签名/IC 卡）共用，勿在各面板重复维护。
 */
export const STATUS_META: Record<ConfigDeviceStatus, { label: string, text: string, bg: string }> = {
  ready: { label: '就绪', text: '#15803d', bg: '#dcfce7' },
  offline: { label: '离线', text: '#b45309', bg: '#fef3c7' },
  unavailable: { label: '不可用', text: '#57606a', bg: '#eceff3' },
  missing: { label: '未接入', text: '#8a919c', bg: '#f3f5f8' },
}

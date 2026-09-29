import type { Permission } from '@desktop/shared'

/** 平台权限的展示文案（权限请求横幅 / 应用中心详情共用） */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'storage': '本地存储',
  'clipboard.read': '读取剪贴板',
  'clipboard.write': '写入剪贴板',
  'notification': '发送通知',
  'window': '控制窗口',
  'network': '访问网络',
  'download': '下载文件',
  'upload': '上传文件',
  'filesystem.read': '读取文件',
  'filesystem.write': '写入文件',
  'media': '摄像头 / 麦克风',
  'geolocation': '地理位置',
  'fullscreen': '进入全屏',
  'pointerLock': '锁定鼠标',
  'display-capture': '屏幕捕获',
}

export function permissionLabel(permission: Permission): string {
  return PERMISSION_LABELS[permission] ?? permission
}

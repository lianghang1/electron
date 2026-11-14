/**
 * 平台权限的展示文案（授权浮层 / 权限状态展示共用）。
 * 键与权限策略表同名（caller.ts Chromium 权限映射 + flavor permissions + facility 路由），
 * 未收录的权限名原样展示，不伪造中文。
 */
export const PERMISSION_LABELS: Readonly<Record<string, string>> = {
  'storage': '本地存储',
  'clipboard.read': '读取剪贴板',
  'clipboard.write': '写入剪贴板',
  'notification': '发送通知',
  'media': '摄像头 / 麦克风',
  'geolocation': '地理位置',
  'fullscreen': '进入全屏',
  'pointerLock': '锁定鼠标',
  'display-capture': '屏幕捕获',
  'downloads': '下载文件',
  'info': '读取运行信息',
  'tabs': '管理页签',
  'update': '检查更新',
}

export function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission
}

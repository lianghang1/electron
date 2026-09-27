import type { DesktopAppManifest } from '@desktop/shared'
import process from 'node:process'
import { bootstrap } from '@desktop/core'
import crmUrl from '../resources/apps/crm.html?asset'
import oaUrl from '../resources/apps/oa.html?asset'
import icon from '../resources/icon.png?asset'

/**
 * 第一阶段代码注册的测试 App（PRD #38）。
 * 页面为本地静态测试页（各自独立配色 / 加载时间戳 / localStorage 计数），
 * 用于验证 AppRegistry / AppInstance / Tab / WebContents / Session / Permission / 导航策略。
 */
const builtinApps: DesktopAppManifest[] = [
  {
    id: 'crm',
    name: 'CRM',
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: crmUrl },
    permissions: ['storage', 'clipboard.read', 'download'],
  },
  {
    id: 'oa',
    name: 'OA',
    version: '1.0.0',
    type: 'internal',
    entry: { type: 'web', url: oaUrl },
    permissions: ['storage'],
  },
]

bootstrap({
  app: {
    id: 'com.company.desktop',
    name: 'Desktop',
    version: '1.0.0',
  },
  window: {
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
  },
  // 飞书式沉浸顶栏：隐藏系统标题栏（自绘窗口控制是唯一入口），backgroundColor 防启动闪白
  browserWindowOptions: { titleBarStyle: 'hidden', backgroundColor: '#f6f7f9' },
  apps: {
    allowThirdParty: false,
    manifests: builtinApps,
    // 远程源联调开关：DESKTOP_APPS_REMOTE 指向返回 DesktopAppManifest 数组的 URL，
    // DESKTOP_APPS_ORIGINS 为其 origin 白名单（逗号分隔，生产部署改成应用中心地址与域名）
    ...(process.env.DESKTOP_APPS_REMOTE
      ? {
          remoteUrl: process.env.DESKTOP_APPS_REMOTE,
          remoteOrigins: process.env.DESKTOP_APPS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
        }
      : {}),
  },
  // 更新体系联调开关：设置 DESKTOP_UPDATE_FEED 环境变量后启用（生产部署改成真实更新服务器地址）
  updates: process.env.DESKTOP_UPDATE_FEED
    ? { url: process.env.DESKTOP_UPDATE_FEED, asar: 'asar-manifest.json' }
    : undefined,
  icon,
})

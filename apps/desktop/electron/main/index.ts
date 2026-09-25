import type { DesktopAppManifest } from '@desktop/shared'
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
    permissions: ['storage', 'clipboard.read'],
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
  apps: {
    allowThirdParty: false,
    manifests: builtinApps,
  },
  icon,
})

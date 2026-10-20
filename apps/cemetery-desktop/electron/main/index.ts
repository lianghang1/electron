import process from 'node:process'
import { bootstrap } from '@desktop/core'
import { app } from 'electron'
import icon from '../../build/icon.png?asset'
import { appId, productName } from '../identity.cjs'

// 仅 Windows：全屏浮层（拍摄/授权弹窗/右键菜单）盖住主窗时，Chromium 原生遮挡计算
// 会把主窗判为完全遮挡而暂停渲染合成——浮层下页面逻辑照跑但画面不更新，结果/提示
// 拖到浮层关闭后才上屏。禁用该特性保持主窗持续合成（mac/Linux 无此遮挡机制，不动）
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}

bootstrap({
  app: {
    id: appId,
    name: productName,
    version: '1.0.0',
  },
  window: {
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
  },
  browserWindowOptions: {
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    backgroundColor: '#f6f7f9',
  },
  features: {
    tray: true,
  },
  apps: {
    allowThirdParty: false,
    manifests: [
      {
        id: 'cemetery',
        name: '智慧陵园',
        version: '1.0.0',
        type: 'internal',
        chrome: 'single',
        entry: { type: 'web', url: 'https://gmuat.fsygroup.com/' },
        permissions: ['storage'],
      },
    ],
  },
  updates: process.env.DESKTOP_UPDATE_FEED
    ? { url: process.env.DESKTOP_UPDATE_FEED, asar: 'asar-manifest.json' }
    : undefined,
  icon,
})

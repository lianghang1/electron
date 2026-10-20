import process from 'node:process'
import { bootstrap } from '@desktop/core'
import icon from '../../build/icon.png?asset'
import { appId, displayName, productName } from '../identity.cjs'

bootstrap({
  app: {
    id: appId,
    name: productName,
    version: '1.0.0',
  },
  window: {
    title: displayName,
    width: 1200,
    height: 800,
  },
  browserWindowOptions: {
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
  features: {
    tray: true,
  },
  icon,
  permissions: 'all',
  updates: process.env.DESKTOP_UPDATE_FEED
    ? { url: process.env.DESKTOP_UPDATE_FEED, asar: 'asar-manifest.json' }
    : undefined,
})

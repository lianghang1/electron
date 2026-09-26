import { bootstrap } from '@desktop/core'
import { loadBusinessConfig } from './config'
import { registerFhBusiness } from './peripherals/business'

/**
 * 殡仪馆自助服务终端：Kiosk 形态（单应用全屏，无 Tab Shell）。
 * 自有受信业务，session 权限 'all'；进程级安全基线由 core 写死生效。
 * 韧性三项全开：大厅无人值守场景，崩溃自恢复 + 开机自启 + 防误关机。
 * 设备通道（读卡器/打印机）由平台通用层提供（内置 mock），业务通道见 peripherals/business.ts。
 */
bootstrap({
  app: {
    id: 'com.company.funeral',
    name: 'FhKiosk',
    version: '1.0.0',
  },
  window: {
    title: '殡仪馆自助服务终端',
    width: 1920,
    height: 1080,
  },
  apps: {
    allowThirdParty: false,
  },
  // 单应用形态：不装配 Tab 体系
  features: {
    tabs: false,
  },
  resilience: {
    crashReload: true,
    autoLaunch: true,
    exitGuard: true,
  },
  browserWindowOptions: {
    fullscreen: true,
    kiosk: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f6f3', // 与 renderer 底色一致，避免全屏启动闪白
  },
  permissions: 'all',
})

// ---- 殡仪馆业务通道（app 本地契约 fh:*，handler 在 app 侧注册） ----
registerFhBusiness(loadBusinessConfig())

import { bootstrap, handle } from '@desktop/core'
import { loadBusinessConfig } from './config'
import { registerIdCardReader } from './peripherals/idcard-reader'
import { registerPrinter } from './peripherals/printer'

/**
 * 医院自助服务终端：Kiosk 形态（单应用全屏，无 Tab Shell）。
 * 自有受信业务，session 权限 'all'；进程级安全基线由 core 写死生效。
 * 韧性三项全开：大厅无人值守场景，崩溃自恢复 + 开机自启 + 防误关机。
 */
bootstrap({
  app: {
    id: 'com.company.hospital',
    name: 'HospitalKiosk',
    version: '1.0.0',
  },
  window: {
    title: '医院自助服务终端',
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
    backgroundColor: '#f5f8fc', // 与 renderer 底色一致，避免全屏启动闪白
  },
  permissions: 'all',
})

// ---- 业务通道：外设服务 + 业务配置（契约 hospital:* 段，handler 在 app 侧注册） ----
const businessConfig = loadBusinessConfig()
registerIdCardReader()
registerPrinter()
handle('hospital:config:get', () => businessConfig)

import process from 'node:process'
import { bootstrap } from '@desktop/core'
import { loadBusinessConfig } from './config'
import { registerHospitalBusiness } from './peripherals/business'

/**
 * 医院自助服务终端：Kiosk 形态（单应用全屏，无 Tab Shell）。
 * 自有受信业务，session 权限 'all'；进程级安全基线由 core 写死生效。
 * 韧性三项全开：大厅无人值守场景，崩溃自恢复 + 开机自启 + 防误关机。
 * 设备通道（读卡器/打印机）由平台通用层提供（内置 mock），业务通道见 peripherals/business.ts。
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
  // 更新体系开关：DESKTOP_UPDATE_FEED 指向更新服务器（整包 latest.yml + asar 清单同源），
  // 生产部署写进部署环境；未配置则两种更新都禁用
  updates: process.env.DESKTOP_UPDATE_FEED
    ? { url: process.env.DESKTOP_UPDATE_FEED, asar: 'asar-manifest.json' }
    : undefined,
  // 单应用形态：不装配 Tab 体系
  features: {
    tabs: false,
  },
  resilience: {
    crashReload: true,
    autoLaunch: true,
    exitGuard: true,
    scheduledRestart: {},
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

// ---- 医院业务通道（app 本地契约 hospital:*，handler 在 app 侧注册） ----
registerHospitalBusiness(loadBusinessConfig())

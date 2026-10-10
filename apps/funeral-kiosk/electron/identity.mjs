/**
 * 应用身份唯一真源：运行时（electron/main 的 bootstrap）与打包（electron-builder.js）共同引用，
 * 改产品名只需要改这里，构建产物各处（exe 名/目录/安装包文件名/快捷方式/卸载列表）均由此派生。
 *
 * 用 .mjs 而非 .ts 的原因：electron-builder 26 的 .ts 配置走 config-file-ts 编译缓存，
 * 编译后需在用户缓存目录创建 node_modules 符号链接，Windows 无符号链接特权（未开开发者模式）时
 * EPERM 直接崩溃；.js 配置走原生 ESM import，零编译零符号链接。
 */

/** 打包身份 ID：appId（对应 bootstrap.app.id，Windows App User Model ID / 单实例锁等运行时身份的基础） */
export const appId = 'com.sfi.app.funeral.service'

/**
 * 英文产品名：exe 名 / 安装目录 / 安装包文件名前缀（对应 bootstrap.app.name）。必须 ASCII：
 * electron-builder 对非 ASCII productName 强制回退 sanitized name，@app/funeral-kiosk 会变成难看的 @appfuneralkiosk 目录
 */
export const productName = 'FuneralKiosk'

/** 面向用户的中文显示名：窗口标题 / 桌面快捷方式名称 / 「应用和功能」卸载列表显示名 */
export const displayName = '殡仪服务自助机'

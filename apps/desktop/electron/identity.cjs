/**
 * 应用身份唯一真源：运行时（electron/main 的 bootstrap）与打包（electron-builder.cjs）共同引用，
 * 改产品名只需要改这里，构建产物各处（exe 名/目录/安装包文件名）均由此派生。
 *
 * 用 .cjs 的原因：electron-builder 只自动探测 electron-builder.{yml,yaml,json,json5,toml,js,cjs,ts}，
 * 其中 .js 会被 cmd 当作 postinstall 命令误执行（PATHEXT 含 .js），.cjs 是唯一无撞名的 JS 后缀；
 * .ts 配置走 config-file-ts 编译缓存，Windows 无符号链接特权时 EPERM，一并排除。
 * CJS 同步 require 决定了本文件不能用 ESM（.mjs 不被探测，也无法被 .cjs 同步引用）。
 */

/** 打包身份 ID：appId（对应 bootstrap.app.id，Windows App User Model ID / 单实例锁等运行时身份的基础） */
const appId = 'com.company.desktop'

/**
 * 英文产品名：exe 名 / 安装目录 / 安装包文件名前缀（对应 bootstrap.app.name）。必须 ASCII：
 * electron-builder 对非 ASCII productName 强制回退 sanitized name，@app/desktop 会变成难看的 @appdesktop 目录
 */
const productName = 'Desktop'

/** 面向用户的显示名：窗口标题 / Shell 品牌区（本产品无独立中文名，与 productName 一致） */
const displayName = 'Desktop'

module.exports = { appId, productName, displayName }

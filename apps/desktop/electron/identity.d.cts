/**
 * 应用身份的类型声明：实现在同目录 identity.cjs，TS 侧（electron/main）引用 identity.cjs 时
 * 由此文件获得显式类型；打包配置（electron-builder.cjs）为 JS，直接 require .cjs，无需本文件。
 */

/** 打包身份 ID：appId（对应 bootstrap.app.id，Windows App User Model ID / 单实例锁等运行时身份的基础） */
export declare const appId: string

/** 英文产品名：exe 名 / 安装目录 / 安装包文件名前缀（对应 bootstrap.app.name）。必须 ASCII（原因见 identity.cjs 注释） */
export declare const productName: string

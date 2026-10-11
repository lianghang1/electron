/**
 * launcher 引导器的类型声明：实现在同目录 index.cjs（CJS 副作用入口）。
 * 启动时序函数导出仅供单测（packages/core/test/launcher.test.ts）使用，
 * Electron 运行时按 package.json main 直接执行本模块，不消费导出。
 */

/** 数字段版本比较（>0: a 新于 b），与 AsarUpdateService.compareVersions 同规则 */
export declare function compareVersions(a: string, b: string): number

/** 首启判活：未存活 60s 回滚热更，已稳定清理旧热更包（单测用） */
export declare function settleOrRollback(): void

/** 消费 pending 标记：切换 current 指针指向新热更包（单测用） */
export declare function applyPending(): void

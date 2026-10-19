/**
 * launcher 引导器的类型声明：实现在同目录 index.cjs（CJS 副作用入口）。
 * 启动时序函数导出仅供单测（packages/core/test/launcher.test.ts）使用，
 * Electron 运行时按 package.json main 直接执行本模块，不消费导出。
 */

/** 版本比较（>0: a 新于 b），与 AsarUpdateService.compareVersions 同规则（一致性测试强制同步） */
export declare function compareVersions(a: string, b: string): number

/**
 * 首启判活：first-run 标记仍在（上次未活过 60s，标记由 scheduleStableClear
 * 经进程内定时器删除）→ 回滚热更（单测用）
 */
export declare function settleOrRollback(): void

/** 消费 pending 标记：切换 current 指针指向新热更包（单测用） */
export declare function applyPending(): void

/** 稳定判定：成功加载核心后经进程内定时器删除 first-run 标记（单测用） */
export declare function scheduleStableClear(): void

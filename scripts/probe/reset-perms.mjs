// 复位 lab 全部运行时权限决策（历史「允许」会被持久化导致弹窗不再出现——测试副作用，非代码问题）
import { resetLabPerms } from './_lib.mjs'

await resetLabPerms()
console.log('lab permissions reset')

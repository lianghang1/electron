/**
 * 平台 Shell 的内部身份：Shell 不是注册 App（无 manifest），
 * IPC 侧按此标记全量放行权限、放行 Shell 专属通道。
 */
export const SHELL_APP_ID = 'desktop'

import type { Permission, PermissionRequest } from '@desktop/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { permissionLabel } from './use-permission-labels'

/** 运行时权限请求：订阅 Main 推送，用户决策后回传并移除；App 关闭后未决策的请求同步作废 */
export function usePermissionRequests() {
  const requests = ref<PermissionRequest[]>([])
  let unsubscribe: (() => void) | null = null
  let unsubscribeTabs: (() => void) | null = null

  onMounted(() => {
    unsubscribe = window.desktop.events.on('permission:request', (request) => {
      if (!requests.value.some(item => item.requestId === request.requestId))
        requests.value.push(request)
    })
    // Tab 关闭后其授权条立即消失（Main 侧同时按拒绝结束挂起请求）
    unsubscribeTabs = window.desktop.events.on('tabs:updated', (list) => {
      requests.value = requests.value.filter(request =>
        list.some(tab => tab.appId === request.appId),
      )
    })
  })

  onBeforeUnmount(() => {
    unsubscribe?.()
    unsubscribeTabs?.()
  })

  function label(permission: Permission): string {
    return permissionLabel(permission)
  }

  async function respond(requestId: string, granted: boolean): Promise<void> {
    await window.desktop.permission.respond(requestId, granted)
    requests.value = requests.value.filter(item => item.requestId !== requestId)
  }

  return { requests, label, respond }
}

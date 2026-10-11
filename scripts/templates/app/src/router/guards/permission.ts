import type { Router } from 'vue-router'

export function createPermissionGuard(router: Router) {
  // 业务权限守卫在此实现（路由元数据约定见 src/types/router.d.ts 的 RouteMeta）
  router.beforeEach(() => {})
}

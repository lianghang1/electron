import type { Router } from 'vue-router'

export function createTitleGuard(router: Router) {
  // 页面标题守卫在此实现（配合 RouteMeta.title）
  router.beforeEach(() => {})
}

import type { Router } from 'vue-router'

export function createPermissionGuard(router: Router) {
  router.beforeEach((to) => {
    // TODO
    console.debug(to)
  })
}

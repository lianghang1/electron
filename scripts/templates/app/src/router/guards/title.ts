import type { Router } from 'vue-router'

export function createTitlenGuard(router: Router) {
  router.beforeEach((to) => {
    // TODO
    console.debug(to)
  })
}

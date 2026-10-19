import type { Router } from 'vue-router'
import { createPermissionGuard } from './permission'
import { createTitleGuard } from './title'

export function createRouterGuards(router: Router) {
  createPermissionGuard(router)
  createTitleGuard(router)
}

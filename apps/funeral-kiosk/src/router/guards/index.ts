import type { Router } from 'vue-router'
import { createPermissionGuard } from './permission'
import { createTitlenGuard } from './title'

export function createRouterGuards(router: Router) {
  createPermissionGuard(router)
  createTitlenGuard(router)
}

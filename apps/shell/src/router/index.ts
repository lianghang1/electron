import type { App } from 'vue'

import { createRouter as _createRouter, createWebHashHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

export const router = _createRouter({
  history: createWebHashHistory(),
  routes,
})

export async function createRouter(app: App) {
  app.use(router)
  await router.isReady()
}

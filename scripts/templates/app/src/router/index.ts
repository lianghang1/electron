import type { App } from 'vue'
import type { RouterHistory } from 'vue-router'
import { createRouter as _createRouter, createMemoryHistory, createWebHashHistory, createWebHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'
import { createRouterGuards } from './guards'

const historyCreatorMap: Record<ImportMetaEnv['VITE_APP_ROUTER_MODE'], (base?: string) => RouterHistory> = {
  hash: createWebHashHistory,
  history: createWebHistory,
  memory: createMemoryHistory,
}

export const router = _createRouter({
  history: historyCreatorMap[import.meta.env.VITE_APP_ROUTER_MODE](import.meta.env.VITE_APP_PUBLIC_PATH),
  routes,
})

export async function createRouter(app: App) {
  app.use(router)

  createRouterGuards(router)
}

if (import.meta.hot) {
  handleHotUpdate(router)
}

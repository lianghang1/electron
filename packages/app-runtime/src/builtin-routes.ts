import type { Component } from 'vue'

/**
 * embedded 应用路由注册表：融合页唯一接入入口。
 * 页面组件经注册进入 shell 路由，manifest.entry = { kind: 'embedded', route } 指向这里。
 */
const routes = new Map<string, Component>()

export function registerEmbeddedApp(route: string, component: Component): void {
  if (routes.has(route))
    throw new Error(`[builtin-routes] route already registered: ${route}`)
  routes.set(route, component)
}

export function resolveEmbeddedRoute(route: string): Component | undefined {
  return routes.get(route)
}

export function listEmbeddedRoutes(): string[] {
  return [...routes.keys()]
}

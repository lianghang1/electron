import type { Component } from 'vue'

/**
 * embedded 应用路由注册表（渲染层）：融合页唯一接入入口。
 * 页面组件经注册进入 shell 路由，manifest.entry = { kind: 'embedded', route } 指向这里。
 * （自 app-runtime 迁入：vue 组件是渲染层概念，不进主进程包——铁律三）
 */
const routes = new Map<string, Component>()

export function registerEmbeddedApp(route: string, component: Component): void {
  // 覆盖而非抛错：渲染层 dev HMR 会重新执行入口模块，重复注册应取最新组件
  routes.set(route, component)
}

export function resolveEmbeddedRoute(route: string): Component | undefined {
  return routes.get(route)
}

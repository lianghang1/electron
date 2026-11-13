import type { IpcDefs, IpcDomainValue } from '../contract'
import type { ContentRect } from './tabs'
import { defineIpcDomain, send } from '../contract'

/**
 * 根面域契约：直接挂在 window.桥面根上的跨分组基础面。
 * markFirstPaint 是启动打点（T4 首帧），reportContentRect 与 tabs.setWorkArea
 * 同源（渲染层两种语义入口，主进程共用一份布局事实）。
 */
export const systemDomain = defineIpcDomain('system', {
  reportContentRect: send<(rect: ContentRect) => void>(),
  markFirstPaint: send<() => void>(),
}, { root: true }) satisfies IpcDomainValue<'system', IpcDefs>

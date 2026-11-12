import type { IpcDefs, IpcDomainValue } from '../contract'
import { defineIpcDomain, invoke, send } from '../contract'

/** 内容区矩形：WebContentsView 的布局依据（渲染层自绘 chrome，主进程不猜） */
export interface ContentRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Tab 域契约：细粒度控制。reload 为管理动作（主进程校验调用方已登记）；
 * setWorkArea 为高频单向 send（拖拽缩放期间逐帧上报，不走 invoke 回执）。
 */
export const tabsDomain = defineIpcDomain('tabs', {
  reload: invoke<(instanceId: string) => void>(),
  setWorkArea: send<(rect: ContentRect) => void>(),
}) satisfies IpcDomainValue<'tabs', IpcDefs>

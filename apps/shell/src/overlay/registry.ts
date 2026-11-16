import type { OverlaySurfaceMode } from '@shell/shared/ipc'
import type { Component } from 'vue'
import type { MenuView, PermissionView } from './types'
import { shell } from '@shell/bridge/client'
import CaptureDialog from '../components/capture/Dialog.vue'
import AppCenter from '../components/overlay/AppCenter.vue'
import CommandPalette from '../components/overlay/CommandPalette.vue'
import ConfigCard from '../components/overlay/ConfigCard.vue'
import PermissionCard from '../components/overlay/PermissionCard.vue'
import SettingsDialog from '../components/overlay/SettingsDialog.vue'
import TabMenu from '../components/overlay/TabMenu.vue'
import ToastStack from '../components/overlay/ToastStack.vue'
import UpdatePromptCard from '../components/overlay/UpdatePromptCard.vue'

/**
 * 表面动作基建：registry 的 wire 回调拿到的上下文。dismiss/action/hoverCapture
 * 由引擎注入，payload/id 是动作所属实例（多实例表面按实例寻址）。
 */
export interface OverlaySurfaceCtx {
  /** 实例 id（= OverlaySurfaceState.id） */
  id: string
  /** 该实例的 payload 原样（wire 内按视图类型收窄） */
  payload: unknown
  dismiss: (surface: string, id?: string) => void
  action: (surface: string, id: string, type: string, data?: Record<string, unknown>) => void
  hoverCapture: (hovering: boolean) => void
}

export interface OverlaySurfaceEntry {
  /** 表面标识（与主进程 SURFACE_MODES 目录对齐） */
  surface: string
  mode: OverlaySurfaceMode
  component: Component
  /** 容器参数覆盖：遮罩显隐、遮罩外点是否关闭、落位方式 */
  container?: {
    /** 是否绘制遮罩（缺省 true；toast/notification 系不适用） */
    mask?: boolean
    /** 点击遮罩关闭表面（缺省 true；必须显式决策的权限卡为 false） */
    maskClose?: boolean
    /** 落位：居中（缺省）或锚点（payload.x/y） */
    placement?: 'center' | 'anchor'
  }
  /** payload → 组件 props（payload 本身就是 props 对象时省略） */
  mapProps?: (payload: unknown) => Record<string, unknown>
  /** 组件 emit → 基建/域动作接线；key 与组件 defineEmits 对齐 */
  wire?: Record<string, (ctx: OverlaySurfaceCtx, ...args: unknown[]) => void>
}

/**
 * 表面注册表：表面清单即产品浮层全集——业务组件纯内容，容器行为按 mode 归
 * SurfaceOutlet 配对，动作接线集中在此（业务不再各自摸基建）。
 */
export const overlayRegistry: OverlaySurfaceEntry[] = [
  {
    surface: 'toast-stack',
    mode: 'toast',
    component: ToastStack,
    wire: {
      'hover': (ctx, hovering) => ctx.hoverCapture(hovering as boolean),
      'dismiss-notification': (_c, id) => void shell().notifications.dismiss(id as string),
      'clear-notifications': () => void shell().notifications.clear(),
      'dismiss-download': (_c, taskId) => void shell().downloads.dismiss(taskId as string),
      'open-download': (_c, taskId) => void shell().downloads.open(taskId as string),
      'reveal-download': (_c, taskId) => void shell().downloads.reveal(taskId as string),
    },
  },
  {
    surface: 'permission',
    mode: 'dialog',
    component: PermissionCard,
    container: { maskClose: false },
    mapProps: payload => ({ permission: payload as PermissionView }),
    wire: {
      resolve: (ctx, granted) => {
        const view = ctx.payload as PermissionView
        ctx.action('permission', ctx.id, 'resolve', { requestId: view.requestId, granted: granted === true })
      },
    },
  },
  {
    surface: 'tab-menu',
    mode: 'dialog',
    component: TabMenu,
    container: { mask: false, placement: 'anchor' },
    mapProps: payload => ({ menu: payload as MenuView }),
    wire: {
      select: (ctx, act) => ctx.action('tab-menu', ctx.id, 'select', { action: act as string }),
      close: ctx => ctx.dismiss('tab-menu'),
    },
  },
  {
    surface: 'app-center',
    mode: 'dialog',
    component: AppCenter,
    wire: {
      openApp: async (ctx, appId) => {
        await shell().apps.open(appId as string)
        ctx.dismiss('app-center')
      },
      close: ctx => ctx.dismiss('app-center'),
    },
  },
  {
    surface: 'command-palette',
    mode: 'command',
    component: CommandPalette,
    mapProps: payload => ({ ...payload as { recentIds?: string[] } }),
    wire: {
      select: async (ctx, appId) => {
        await shell().apps.open(appId as string)
        ctx.dismiss('command-palette')
      },
      close: ctx => ctx.dismiss('command-palette'),
    },
  },
  {
    surface: 'update-prompt',
    mode: 'dialog',
    component: UpdatePromptCard,
    mapProps: payload => ({ version: (payload as { version: string }).version }),
    wire: {
      close: ctx => ctx.dismiss('update-prompt'),
      relaunch: () => shell().shell.relaunch(),
    },
  },
  {
    surface: 'config',
    mode: 'dialog',
    component: ConfigCard,
    mapProps: payload => ({ category: (payload as { category: string }).category }),
    wire: {
      close: ctx => ctx.dismiss('config'),
    },
  },
  {
    surface: 'settings',
    mode: 'dialog',
    component: SettingsDialog,
    mapProps: payload => ({ ...payload as { isKiosk?: boolean } }),
    wire: {
      close: ctx => ctx.dismiss('settings'),
    },
  },
  {
    surface: 'capture',
    mode: 'dialog',
    component: CaptureDialog,
    mapProps: payload => ({ session: payload }),
    wire: {
      close: (ctx) => {
        // 浮层内取消：captureDialog.close 清发起方账本并回传空结果；dismiss 只收场表面
        void shell().captureDialog.close()
        ctx.dismiss('capture')
      },
    },
  },
]

export function surfaceEntry(surface: string): OverlaySurfaceEntry | undefined {
  return overlayRegistry.find(e => e.surface === surface)
}

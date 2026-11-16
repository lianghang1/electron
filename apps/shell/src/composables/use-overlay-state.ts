import type { CaptureDialogSession, DownloadTask } from '@shell/shared'
import type { OverlayKind } from '@shell/shared/ipc'
import { shell } from '@shell/bridge/client'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export interface NotificationItem {
  id: string
  title: string
  body?: string
  appName?: string
  level: string
  /** kernel 推送的创建时点：面板按它渲染相对时间 */
  createdAt?: number
  ttlMs: number
}

export interface PermissionView {
  requestId: string
  appId: string
  appName?: string
  permission: string
  origin: string
}

export interface MenuView {
  id: string
  tabId: string
  appId: string
  x: number
  y: number
  closable: boolean
}

export interface PlaneState {
  notifications: NotificationItem[]
  downloads: DownloadTask[]
  permission: PermissionView | null
  menu: MenuView | null
  appCenterOpen: boolean
  paletteOpen: boolean
  updatePrompt: string | null
  config: string | null
}

export interface OverlayState {
  kind: 'plane' | OverlayKind
  params: Record<string, string>
  plane: PlaneState | null
  capture: CaptureDialogSession | null
}

/**
 * 浮层窗状态基座：sync 全量快照 + onUpdated 增量跟随。
 * plane 是透明视图，全局 body 的 --background 底色会把整面画出方形底板，
 * 浮层页必须透掉（透明载体依赖页面自身透明）。
 */
export function useOverlayState() {
  const state = ref<OverlayState | null>(null)
  let unsubscribe: (() => void) | undefined

  /** plane 页面自身的 kind 恒为 'plane'（载体的身份），表面切换全在 plane 快照内 */
  const kind = computed(() => state.value?.kind ?? 'plane')
  const plane = computed(() => (state.value?.kind === 'plane' ? state.value.plane : null))
  const permission = computed(() => plane.value?.permission ?? null)
  /** 交互表面在列 = plane 要收全量鼠标（遮罩外点关闭、卡片交互），toast 独占时才穿透 */
  const interactiveOpen = computed(() => Boolean(
    plane.value && (plane.value.permission || plane.value.menu || plane.value.appCenterOpen
      || plane.value.paletteOpen || plane.value.updatePrompt || plane.value.config),
  ))

  onMounted(async () => {
    document.body.style.background = 'transparent'
    state.value = await shell().overlay.sync() as OverlayState
    unsubscribe = shell().overlay.onUpdated((next) => {
      state.value = next as OverlayState
    })
  })

  onBeforeUnmount(() => {
    unsubscribe?.()
  })

  return { state, kind, plane, permission, interactiveOpen }
}

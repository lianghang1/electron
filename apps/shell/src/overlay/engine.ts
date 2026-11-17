import type { OverlaySnapshot, OverlaySurfaceState } from '@shell/shared/ipc'
import { shell } from '@shell/bridge/client'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 浮层引擎：订阅 OverlayCenter 的单一状态流，暴露表面列表与基建桥。
 * 容器行为按 mode 在 SurfaceOutlet 自动配对；本层只做「先拉后推 + 基建桥接」
 * （穿透/焦点决策在主进程 Center，渲染层仅上报悬停冻结与穿透切换）。
 */
export function useOverlayEngine() {
  const snapshot = ref<OverlaySnapshot>({ surfaces: [], paused: false })
  /** 在列表面（含 dismissed 离场残留，渲染层按 phase 过滤） */
  const surfaces = computed<OverlaySurfaceState[]>(() => snapshot.value.surfaces)
  /** 交互表面（dialog）是否在列：决定 plane 是否收全量鼠标 */
  const interactive = computed(() =>
    snapshot.value.surfaces.some(s => s.phase === 'presented' && s.mode === 'dialog'),
  )

  let offState: (() => void) | undefined

  onMounted(async () => {
    // 先拉后推：同步快照补齐启动间隙，随后跟随 push 单流
    snapshot.value = await shell().overlay.sync()
    offState = shell().overlay.onState((next) => {
      snapshot.value = next
    })
  })
  onBeforeUnmount(() => {
    offState?.()
    offState = undefined
  })

  /** toast 系悬停冻结上报（Center 暂停/恢复 TTL 与下载卡截止时间） */
  function pause(paused: boolean): void {
    void shell().overlay.pause(paused)
  }

  /**
   * toast 卡片悬停切换：交互表面在列时 plane 本就收全量鼠标，只冻结计时；
   * toast 独占时穿透整面 plane，悬停进卡片临时拦截 + 冻结，离开交还。
   */
  function hoverCapture(hovering: boolean): void {
    if (!interactive.value) {
      void shell().overlay.mouseIgnore(!hovering)
    }
    pause(hovering)
  }

  function dismiss(surface: string, id?: string): void {
    void shell().overlay.dismiss({ surface, id })
  }

  function action(surface: string, id: string, type: string, data?: Record<string, unknown>): void {
    void shell().overlay.action({ surface, id, type, data })
  }

  return { snapshot, surfaces, interactive, pause, hoverCapture, dismiss, action }
}

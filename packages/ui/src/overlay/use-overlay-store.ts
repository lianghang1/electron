import type { CaptureDialogSession, DeviceConfigKind, DownloadTask, OverlayWindowKind, PermissionRequest, PlatformNotification, TabContextMenu, TabMenuAction } from '@desktop/shared'
import type { InjectionKey } from 'vue'
import { parseOverlayHash } from '@desktop/shared'
import { computed, inject, onScopeDispose, provide, reactive, ref } from 'vue'

/**
 * 浮层页数据与动作（OverlayApp 的组合式状态源）：
 * 统一全量订阅 + overlay.sync 拉取（Main 按窗口身份定点推送，本窗不承载的通道不会收到消息），
 * 动作直接回传 Main；交互语义（清卡先行 / Main 对账）与旧版页面内联实现一致。
 * 经 provide/useOverlayStore 注入 OverlayApp 组件树，避免子组件重复订阅。
 */

const OVERLAY_STORE_KEY: InjectionKey<OverlayStore> = Symbol('overlay-store')

/** 提供侧：在 OverlayApp 中调用一次，建立订阅与可见性门控 */
export function provideOverlayStore(): OverlayStore {
  const store = createOverlayStore()
  provide(OVERLAY_STORE_KEY, store)
  return store
}

/** 注入侧：浮层子组件获取共享状态（必须在 OverlayApp 树内使用） */
export function useOverlayStore(): OverlayStore {
  const store = inject(OVERLAY_STORE_KEY)
  if (!store) {
    throw new Error('[ui/overlay] OverlayStore 未提供：浮层组件必须在 <OverlayApp> 树内使用')
  }
  return store
}

export interface OverlayStore {
  /** 浮层窗用途（URL hash 透传，Main 创建窗口时决定） */
  kind: OverlayWindowKind
  toasts: PlatformNotification[]
  downloads: DownloadTask[]
  dialogs: PermissionRequest[]
  menu: TabContextMenu | null
  captureSession: CaptureDialogSession | null
  configKind: DeviceConfigKind | null
  appCenterOpen: boolean
  /** 窗口可见（隐藏期不插入卡片 DOM，保证入场动画完整播放） */
  overlayVisible: boolean
  /** 权限决策卡：只渲染队首请求，决策后 Main 推送余下请求 */
  currentRequest: PermissionRequest | null
  /** 消息窗有内容（下载卡或通知堆叠） */
  hasPanelContent: boolean
  openTask: (taskId: string) => void
  revealTask: (taskId: string) => void
  respond: (requestId: string, granted: boolean) => void
  dismissToast: (toastId: string) => void
  dismissDownload: (taskId: string) => void
  /** 选中菜单项：本地立即清卡（清场先行），Main 执行动作后推 null 对账 */
  selectMenu: (action: TabMenuAction) => void
  dismissMenu: () => void
  dismissCapture: () => void
  dismissConfig: () => void
  dismissAppCenter: () => void
}

function createOverlayStore(): OverlayStore {
  const toasts = ref<PlatformNotification[]>([])
  const downloads = ref<DownloadTask[]>([])
  const dialogs = ref<PermissionRequest[]>([])
  const menu = ref<TabContextMenu | null>(null)
  const captureSession = ref<CaptureDialogSession | null>(null)
  const configKind = ref<DeviceConfigKind | null>(null)
  const appCenterOpen = ref(false)

  /** 浮层窗用途：仅决定渲染分支与页面级监听，不裁剪数据订阅 */
  const kind = parseOverlayHash(window.location.hash) ?? 'panel'

  const overlayVisible = ref(false)
  const syncOverlayVisible = (): void => {
    overlayVisible.value = document.visibilityState === 'visible'
  }
  // 初始即同步一次：窗口创建即可见时（如常驻复用窗）不依赖 visibilitychange 也能渲染
  syncOverlayVisible()
  document.addEventListener('visibilitychange', syncOverlayVisible)
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', syncOverlayVisible)
  })

  const unsubs: Array<() => void> = []
  unsubs.push(
    window.desktop.events.on('notification:updated', (list) => {
      toasts.value = list
    }),
    window.desktop.events.on('download:updated', (list) => {
      downloads.value = list
    }),
    window.desktop.events.on('permission:pendingUpdated', (list) => {
      dialogs.value = list
    }),
    window.desktop.events.on('overlay:menuUpdated', (m) => {
      menu.value = m
    }),
    window.desktop.events.on('overlay:captureUpdated', (s) => {
      captureSession.value = s
    }),
    window.desktop.events.on('overlay:configUpdated', (kindValue) => {
      configKind.value = kindValue
    }),
    window.desktop.events.on('overlay:appCenterUpdated', (open) => {
      appCenterOpen.value = open
    }),
  )
  onScopeDispose(() => {
    for (const off of unsubs) {
      off()
    }
  })

  // 主动拉取当前状态：Main 推送可能早于本页事件订阅（did-finish-load ≠ Vue mounted），按窗身份分发
  void window.desktop.overlay.sync().then((state) => {
    toasts.value = state.toasts
    downloads.value = state.downloads
    dialogs.value = state.dialogs
    menu.value = state.menu
    captureSession.value = state.captureSession
    configKind.value = state.configKind
    appCenterOpen.value = state.appCenterOpen
  })

  const currentRequest = computed(() => dialogs.value[0] ?? null)
  const hasPanelContent = computed(() => downloads.value.length > 0 || toasts.value.length > 0)

  const openTask = (taskId: string): void => {
    void window.desktop.download.open(taskId)
  }
  const revealTask = (taskId: string): void => {
    void window.desktop.download.reveal(taskId)
  }
  const respond = (requestId: string, granted: boolean): void => {
    void window.desktop.permission.respond({ requestId, granted })
  }
  const dismissToast = (toastId: string): void => {
    void window.desktop.notification.dismiss(toastId)
  }
  const dismissDownload = (taskId: string): void => {
    void window.desktop.download.dismiss(taskId)
  }
  const selectMenu = (action: TabMenuAction): void => {
    menu.value = null
    void window.desktop.overlay.selectMenu(action)
  }
  const dismissMenu = (): void => {
    menu.value = null
    void window.desktop.overlay.dismissMenu()
  }
  const dismissCapture = (): void => {
    captureSession.value = null
    void window.desktop.overlay.dismissCapture()
  }
  const dismissConfig = (): void => {
    configKind.value = null
    void window.desktop.overlay.dismissConfig()
  }
  const dismissAppCenter = (): void => {
    appCenterOpen.value = false
    void window.desktop.overlay.dismissAppCenter()
  }

  return reactive({
    kind,
    toasts,
    downloads,
    dialogs,
    menu,
    captureSession,
    configKind,
    appCenterOpen: computed(() => appCenterOpen.value),
    overlayVisible: computed(() => overlayVisible.value),
    currentRequest,
    hasPanelContent,
    openTask,
    revealTask,
    respond,
    dismissToast,
    dismissDownload,
    selectMenu,
    dismissMenu,
    dismissCapture,
    dismissConfig,
    dismissAppCenter,
  })
}

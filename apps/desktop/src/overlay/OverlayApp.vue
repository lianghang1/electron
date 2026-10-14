<script setup lang="ts">
import type { DownloadTask, PermissionRequest, PlatformNotification, TabContextMenu, TabMenuAction } from '@desktop/shared'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogRoot,
  DialogTitle,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { formatBytes } from '../composables/use-downloads'
import { permissionLabel } from '../composables/use-permission-labels'

/**
 * 浮层页（OverlayWindow 的 renderer，经 #/overlay 路由挂载）：
 * 原生层级压过 WebContentsView。承载必须盖住 Web 容器区域的浮层。
 * 同一份页面服务三类浮层窗（每窗同时只收一种消息，互斥渲染）：
 * - 消息窗：download:updated 下载通知卡 + notification:received 通知 toast（右上角）
 * - 弹窗窗：permission:pending 运行时授权决策卡（全屏遮罩模态，居中）
 * - 菜单窗：overlay:menuPending Tab 右键菜单（全屏透明模态，锚点定位——页面内容保持可见）
 *
 * 交互语义交给 reka-ui 原语（Toast 滑动关闭/悬停暂停/无障碍、Dialog 焦点圈养/ESC），
 * 外观用 UnoCSS 工具类自绘；卡片样式固定高对比配色（不随 Shell 主题），保证任意背景下清晰可读。
 */
const toasts = ref<PlatformNotification[]>([])
const downloads = ref<DownloadTask[]>([])
const dialogs = ref<PermissionRequest[]>([])
const menu = ref<TabContextMenu | null>(null)

const STATUS_TEXT: Record<DownloadTask['status'], string> = {
  progressing: '下载中',
  completed: '已完成',
  cancelled: '已取消',
  interrupted: '已中断',
}

/** 弹窗窗可见 = 有挂起请求；消息窗内容 = 下载面板 + 通知堆叠 */
const hasPanelContent = computed(() => downloads.value.length > 0 || toasts.value.length > 0)

/** 决策卡逐条处理：只渲染队首请求，决策后 Main 推送余下请求 */
const currentRequest = computed(() => dialogs.value[0] ?? null)

/** 决策卡倒计时秒数（与 Main 的 30s 超时一致，归零由 Main 按拒绝收尾） */
const REQUEST_TIMEOUT_S = 30
const countdowns = reactive<Record<string, number>>({})
let countdownTimer: ReturnType<typeof setInterval> | null = null

/** 弹窗列表变化 → 为新请求起 30s 倒计时，移除已决策请求的计时（用户要求超时倒数可见） */
function syncCountdowns(): void {
  for (const r of dialogs.value) {
    if (countdowns[r.requestId] == null)
      countdowns[r.requestId] = REQUEST_TIMEOUT_S
  }
  for (const id of Object.keys(countdowns)) {
    if (!dialogs.value.some(r => r.requestId === id))
      delete countdowns[id]
  }
  if (dialogs.value.length && !countdownTimer) {
    countdownTimer = setInterval(() => {
      for (const r of dialogs.value) {
        if ((countdowns[r.requestId] ?? 0) > 0)
          countdowns[r.requestId] = (countdowns[r.requestId] ?? 0) - 1
      }
      if (!dialogs.value.length && countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }, 1000)
  }
}

watch(dialogs, syncCountdowns, { deep: true })

/**
 * 浮层渲染门控：窗口隐藏期间不插入卡片 DOM——CSS 动画在元素插入时立即开始计时，
 * 隐藏期插入的话动画在 show 前已播完，用户看到的是静态呈现（「第二次只是显示隐藏」）。
 * visibilitychange 触发后才渲染：show 后首次插入，动画必然在可见状态下播完整一次，
 * 每次弹卡都是完整入场动画（与第一次一致）；动画类常挂，插入即播，无事后补类的重播问题。
 * 弹窗窗与菜单窗共用本门控（各自 document 的可见性互不影响）。
 */
const overlayVisible = ref(false)
function syncOverlayVisible(): void {
  overlayVisible.value = document.visibilityState === 'visible'
}

watch(dialogs, () => {
  void nextTick(syncOverlayVisible)
}, { deep: true })

/**
 * 透明窗鼠标穿透联动：Windows 透明窗整个 bounds 命中鼠标，面板视觉只占右上角——
 * 按命中元素切换穿透（命中 body = 透明区 → 穿透），透明区不遮挡下层页面点击。
 * 面板容器本身 pointer-events:none，命中卡片/按钮才接管（阴影余量也能点穿）。
 * ignore 模式下 forward:true 让页面仍收 mousemove，可感知重新进入卡片。
 */
let lastIgnore: boolean | null = null
function onMouseMove(e: MouseEvent): void {
  const transparent = e.target === document.body || e.target === document.documentElement
  if (transparent === lastIgnore)
    return
  lastIgnore = transparent
  void window.desktop.overlay.ignoreMouse(transparent)
}

async function openTask(taskId: string): Promise<void> {
  await window.desktop.download.open(taskId)
}

async function revealTask(taskId: string): Promise<void> {
  await window.desktop.download.reveal(taskId)
}

async function respond(requestId: string, granted: boolean): Promise<void> {
  await window.desktop.permission.respond(requestId, granted)
  // 列表更新由 Main 统一推送（permission:pending），页面无需本地移除
}

/** 用户滑动/单条关闭 toast：回传 Main 移除（列表更新由 Main 推送） */
function dismissToast(toastId: string): void {
  void window.desktop.notification.dismiss(toastId)
}

/** 关闭单条下载卡片：回传 Main 隐藏（列表更新由 Main 推送） */
function dismissDownload(taskId: string): void {
  void window.desktop.download.dismiss(taskId)
}

// ---- Tab 右键菜单（菜单窗） ----

/** 菜单项固定文案与顺序（与旧版 Shell DOM 菜单一致）；动作由 Main 直接执行 */
const MENU_ITEMS: Array<{ action: TabMenuAction, label: string, danger?: boolean }> = [
  { action: 'reload', label: '刷新页面' },
  { action: 'clearCache', label: '清理缓存' },
  { action: 'clearSite', label: '清除站点数据', danger: true },
  { action: 'close', label: '关闭标签页' },
]

/** 实际渲染项：套壳模式（Main 按 chrome: 'single' 下发 closable=false）剔除「关闭标签页」 */
const visibleMenuItems = computed(() =>
  menu.value && !menu.value.closable
    ? MENU_ITEMS.filter(item => item.action !== 'close')
    : MENU_ITEMS,
)

/** 键盘导航高亮项（上下键移动 / Enter 选中） */
const highlightIndex = ref(0)
watch(menu, () => {
  highlightIndex.value = 0
})

/** 选中：本地立即清卡（清场先行），Main 执行动作后推 overlay:menuPending null 对账 */
function selectMenu(action: TabMenuAction): void {
  menu.value = null
  void window.desktop.overlay.menuSelect(action)
}

/** ESC / 点击菜单外：回传 Main 关窗，本地立即清卡 */
function dismissMenu(): void {
  menu.value = null
  void window.desktop.overlay.menuDismiss()
}

/** 菜单窗键盘：ESC 关闭 / 上下移动高亮 / Enter 选中（菜单窗 show 时持有焦点） */
function onMenuKeydown(e: KeyboardEvent): void {
  if (!menu.value)
    return
  if (e.key === 'Escape') {
    e.preventDefault()
    dismissMenu()
  }
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightIndex.value = (highlightIndex.value + 1) % visibleMenuItems.value.length
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIndex.value = (highlightIndex.value - 1 + visibleMenuItems.value.length) % visibleMenuItems.value.length
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    selectMenu(visibleMenuItems.value[highlightIndex.value].action)
  }
}

/** 菜单卡锚点定位：Shell 转发的右键坐标（内容区 DIP = 菜单窗内坐标），贴边时向内收 */
const MENU_CARD_W = 190
const MENU_CARD_H = 140
const menuPos = computed(() => {
  if (!menu.value)
    return { left: '0px', top: '0px' }
  const left = Math.max(4, Math.min(menu.value.x, window.innerWidth - MENU_CARD_W - 8))
  const top = Math.max(4, Math.min(menu.value.y, window.innerHeight - MENU_CARD_H - 8))
  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
})

/** reka Toast 的关闭事件统一走 Main（控制态由 Main 数据推导，页面不私存） */
function onToastOpenChange(toastId: string, value: boolean): void {
  if (!value)
    dismissToast(toastId)
}

/** 遮罩/卡片外点击不关闭（模态语义：必须显式决策或等待超时） */
function keepDialogOpen(event: Event): void {
  event.preventDefault()
}

/** ESC = 本次拒绝（贴近浏览器权限弹窗习惯，超时不持久化的语义一致） */
function onDialogEscape(event: KeyboardEvent): void {
  event.preventDefault()
  if (currentRequest.value)
    void respond(currentRequest.value.requestId, false)
}

/**
 * 面板高度回报：量「自然内容高度」而非裁剪后高度——
 * 面板超高时内部滚动（max-h + overflow），若回报裁剪值窗口会收缩死循环
 */
const PANEL_MARGIN = 12
const panelRef = ref<HTMLElement | null>(null)

function reportHeight(): void {
  const panel = panelRef.value
  if (!panel)
    return
  void window.desktop.overlay.resize(panel.scrollHeight + PANEL_MARGIN * 2)
}

/** 面板超高内部滚动时新 toast 在底部：追加后自动滚到底，保证最新通知可见 */
function scrollPanelToBottom(): void {
  const panel = panelRef.value
  if (panel)
    panel.scrollTop = panel.scrollHeight
}

const unsubs: Array<() => void> = []

onMounted(async () => {
  unsubs.push(
    window.desktop.events.on('notification:received', (list) => {
      toasts.value = list
    }),
    window.desktop.events.on('download:updated', (list) => {
      downloads.value = list
    }),
    window.desktop.events.on('permission:pending', (list) => {
      dialogs.value = list
    }),
    window.desktop.events.on('overlay:menuPending', (m) => {
      menu.value = m
    }),
  )
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onMenuKeydown)
  document.addEventListener('visibilitychange', syncOverlayVisible)
  // 主动拉取当前状态：Main 推送可能早于本页事件订阅（did-finish-load ≠ Vue mounted）
  const state = await window.desktop.overlay.sync()
  toasts.value = state.toasts
  downloads.value = state.downloads
  dialogs.value = state.dialogs
  menu.value = state.menu
})

onBeforeUnmount(() => {
  for (const off of unsubs) off()
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('keydown', onMenuKeydown)
  document.removeEventListener('visibilitychange', syncOverlayVisible)
  if (countdownTimer)
    clearInterval(countdownTimer)
})

// 消息窗内容变化 → 量高回报 + 滚到底（弹窗窗全屏铺开，不参与）
watch([toasts, downloads], () => {
  void nextTick(() => {
    reportHeight()
    scrollPanelToBottom()
  })
}, { deep: true })

/** 下载卡片图标底色（按状态）：进行中青玉 / 完成绿 / 失败红 */
const DL_ICON_BG: Record<DownloadTask['status'], string> = {
  progressing: 'bg-[#0f766e]',
  completed: 'bg-[#16a34a]',
  cancelled: 'bg-[#dc2626]',
  interrupted: 'bg-[#dc2626]',
}

/** 决策按钮外观：主次按钮共用形状，颜色各给一份（避免同属性类级联冲突） */
function dialogBtnClass(primary: boolean): string {
  const base = 'ov-btn h-[32px] cursor-pointer rounded-[8px] border px-[18px] ml-[8px] text-[13px] font-500 font-[inherit] transition-colors duration-[120ms]'
  return primary
    ? `${base} ov-btn--primary border-[#0f766e] bg-[#0f766e] text-white hover:border-[#0d6a63] hover:bg-[#0d6a63]`
    : `${base} border-[#d5dae1] bg-white text-[#1f2328] hover:bg-[#f3f6f9]`
}
</script>

<template>
  <ToastProvider :duration="8000" label="平台通知">
    <!-- 权限弹窗：reka Dialog 承担模态遮罩 / 焦点圈养 / ESC；
         逐条决策（只渲染队首），ESC = 本次拒绝，遮罩点击不关闭 -->
    <DialogRoot :open="currentRequest !== null">
      <DialogOverlay
        v-if="overlayVisible"
        class="ov-dialog ov-anim-fade fixed inset-0 z-[10] bg-[rgba(15,23,42,0.28)]"
      />
      <DialogContent
        class="fixed inset-0 z-[20] flex flex-col items-center justify-center"
        @escape-key-down="onDialogEscape"
        @pointer-down-outside="keepDialogOpen"
        @interact-outside="keepDialogOpen"
      >
        <div
          v-if="currentRequest && overlayVisible"
          :key="currentRequest.requestId"
          class="ov-dialog__card ov-anim-pop box-border w-[400px] rounded-[12px] border-x border-b border-x-[rgba(2,8,20,0.1)] border-b-[rgba(2,8,20,0.1)] bg-white px-[18px] pb-[14px] pt-[16px] shadow-[0_8px_24px_rgba(2,8,20,0.16)]"
        >
          <div class="ov-dialog__head mb-[10px] flex items-center">
            <span class="ov-dialog__icon mr-[8px] flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[8px] bg-[#0f766e] text-white">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </span>
            <DialogTitle class="ov-dialog__title m-0 text-[14px] font-600 text-[#1f2328]">
              权限请求
            </DialogTitle>
          </div>
          <DialogDescription class="ov-dialog__text m-0 mb-[6px] text-[13px] leading-[1.6] text-[#57606a] [&_strong]:font-600 [&_strong]:text-[#1f2328]">
            <strong>{{ currentRequest.appName }}</strong> 请求使用「{{ permissionLabel(currentRequest.permission) }}」，请确认是否允许。
          </DialogDescription>
          <p class="ov-dialog__hint m-0 mb-[12px] text-[11.5px] text-[#8a919c]">
            <b class="ov-dialog__count font-600 text-[#0f766e] tabular-nums">{{ countdowns[currentRequest.requestId] ?? REQUEST_TIMEOUT_S }}</b> 秒内未处理将按本次拒绝，不影响下次使用
          </p>
          <div class="ov-dialog__actions flex justify-end">
            <button :class="dialogBtnClass(false)" @click="respond(currentRequest.requestId, false)">
              拒绝
            </button>
            <button :class="dialogBtnClass(true)" @click="respond(currentRequest.requestId, true)">
              允许
            </button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>

    <!-- Tab 右键菜单：原生浮层窗承载（页面内容保持可见，无需视图抑制）。
         全屏透明层拦截点击（点菜单外 = 关闭），菜单卡锚定 Shell 转发的右键坐标，
         固定浅色配色（不随 Shell 主题，浮层页统一策略） -->
    <div
      v-if="menu && overlayVisible"
      :key="menu.id"
      class="ov-menu ov-anim-fade fixed inset-0 z-[10]"
      @contextmenu.prevent
      @pointerdown.self="dismissMenu"
    >
      <div
        class="ov-menu__card ov-anim-pop fixed min-w-[184px] rounded-[10px] border border-[rgba(2,8,20,0.1)] bg-white p-[4px] shadow-[0_10px_28px_rgba(2,8,20,0.18),0_2px_8px_rgba(2,8,20,0.1)]"
        :style="menuPos"
      >
        <template v-for="(item, i) in visibleMenuItems" :key="item.action">
          <div v-if="i === visibleMenuItems.length - 1" class="ov-menu__sep mx-[6px] my-[4px] h-px bg-[#e8ecf1]" />
          <button
            class="ov-menu__item flex h-[28px] w-full cursor-pointer items-center rounded-[6px] border-none bg-transparent px-[10px] text-left text-[12.5px] font-[inherit] transition-colors duration-[120ms]"
            :class="[
              item.danger ? 'text-[#dc2626]' : 'text-[#1f2328]',
              i === highlightIndex ? (item.danger ? 'bg-[#fee2e2]' : 'bg-[#f3f6f9]') : '',
            ]"
            @pointermove="highlightIndex = i"
            @click="selectMenu(item.action)"
          >
            {{ item.label }}
          </button>
        </template>
      </div>
    </div>

    <!-- 右上角消息区：下载通知卡 + 通知 toast（reka Toast：悬停暂停 / 滑动关闭 / 单条 ×）。
         容器穿透（pointer-events-none），命中卡片才接管；超高内部滚动不超出软件区域 -->
    <div
      v-if="hasPanelContent"
      ref="panelRef"
      class="ov-panel relative m-[12px] flex max-h-[calc(100vh-24px)] w-[320px] flex-col overflow-y-auto pointer-events-none"
    >
      <!-- 下载通知卡：与通知 toast 同款外观，逐条独立（不聚合）；终态 8s 自动消失，× 手动关闭 -->
      <div
        v-for="task in downloads"
        :key="task.id"
        class="ov-dl ov-anim-slide pointer-events-auto relative mb-[8px] flex rounded-[12px] border border-[rgba(2,8,20,0.1)] bg-white px-[12px] pb-[10px] pt-[9px] shadow-[0_4px_14px_rgba(2,8,20,0.08)]"
        :title="task.path"
      >
        <span class="ov-dl__icon mr-[8px] mt-[2px] flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] text-white" :class="DL_ICON_BG[task.status]">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
        </span>
        <div class="ov-dl__main min-w-0 flex-1">
          <p class="ov-dl__name m-0 truncate text-[12.5px] font-600 text-[#1f2328]">
            {{ task.filename }}
          </p>
          <p class="ov-dl__desc m-0 mt-[2px] text-[11.5px] text-[#57606a]">
            {{ STATUS_TEXT[task.status] }}
            <template v-if="task.status === 'progressing' && task.percent >= 0">
              · {{ task.percent }}%
            </template>
            <template v-if="task.total > 0">
              · {{ formatBytes(task.total) }}
            </template>
          </p>
          <div
            v-if="task.status === 'progressing' && task.percent >= 0"
            class="ov-dl__track mt-[6px] h-[4px] w-full overflow-hidden rounded-[2px] bg-[#e8ecf1]"
          >
            <div class="ov-dl__bar h-full rounded-[2px] bg-[#0f766e] transition-[width] duration-200" :style="{ width: `${task.percent}%` }" />
          </div>
          <div v-if="task.status === 'completed'" class="ov-dl__ops mt-[6px] flex justify-end">
            <button class="ov-dl__op flex-none cursor-pointer rounded-[6px] border border-[#d5dae1] bg-white px-[10px] py-[3px] text-[11px] text-[#1f2328] transition-colors duration-[120ms] hover:border-[#0f766e] hover:text-[#0f766e]" @click="openTask(task.id)">
              打开
            </button>
            <button class="ov-dl__op flex-none cursor-pointer rounded-[6px] border border-[#d5dae1] bg-white px-[10px] py-[3px] text-[11px] text-[#1f2328] transition-colors duration-[120ms] hover:border-[#0f766e] hover:text-[#0f766e]" @click="revealTask(task.id)">
              文件夹
            </button>
          </div>
        </div>
        <button
          class="ov-dl__close absolute right-[6px] top-[6px] h-[18px] w-[18px] cursor-pointer border-none bg-transparent p-0 text-[12px] leading-[18px] text-[#8a919c] transition-colors duration-[120ms] hover:text-[#1f2328]"
          @click="dismissDownload(task.id)"
        >
          ×
        </button>
      </div>
      <ToastViewport
        class="ov-panel__toasts m-0 flex-none list-none p-0 [&>*+*]:mt-2"
      >
        <ToastRoot
          v-for="toast in toasts"
          :key="toast.id"
          :open="true"
          :duration="8000"
          class="ov-toast ov-anim-slide pointer-events-auto relative flex rounded-[12px] border border-[rgba(2,8,20,0.1)] bg-white px-[12px] pb-[10px] pt-[9px] shadow-[0_4px_14px_rgba(2,8,20,0.08)]"
          @update:open="value => onToastOpenChange(toast.id, value)"
        >
          <span class="ov-toast__icon mr-[8px] mt-[2px] flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] bg-[#0f766e] text-white">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          </span>
          <div class="ov-toast__main min-w-0 flex-1">
            <p class="ov-toast__app m-0 text-[11px] text-[#8a919c]">
              {{ toast.appName }}
            </p>
            <ToastTitle class="ov-toast__title m-0 mt-[2px] text-[12.5px] font-600 text-[#1f2328]">
              {{ toast.title }}
            </ToastTitle>
            <ToastDescription v-if="toast.body" class="ov-toast__body m-0 mt-[2px] text-[11.5px] leading-[1.5] text-[#57606a]">
              {{ toast.body }}
            </ToastDescription>
          </div>
          <ToastClose
            class="ov-toast__close absolute right-[6px] top-[6px] h-[18px] w-[18px] cursor-pointer border-none bg-transparent p-0 text-[12px] leading-[18px] text-[#8a919c] transition-colors duration-[120ms] hover:text-[#1f2328]"
          >
            ×
          </ToastClose>
        </ToastRoot>
      </ToastViewport>
    </div>
  </ToastProvider>
</template>

<style>
/* 浮层窗口页面基座：透明背景 + 无边距（Shell 本体与浮层共用 index.html） */
html,
body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
}

/* 面板超高内部滚动：隐藏滚动条（窗口高度贴合内容，只有极端堆积才滚动，滚动条无视觉意义） */
.ov-panel {
  scrollbar-width: none;
}
.ov-panel::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* ---- 动画（Uno 工具类不便表达的 keyframes，类名常挂，元素插入时播一次） ---- */
@keyframes ov-fade {
  from { opacity: 0; }
}
@keyframes ov-pop {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
}
@keyframes ov-slide {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
}
.ov-anim-fade { animation: ov-fade 0.32s ease-out; }
.ov-anim-pop { animation: ov-pop 0.24s ease-out; }
.ov-anim-slide { animation: ov-slide 0.2s ease; }

/* 决策卡顶部品牌色描边（其余三边由 Uno 的 border-x/border-b 负责，避免同属性级联） */
.ov-dialog__card {
  border-top: 3px solid #0f766e;
}

/* 相邻操作按钮间距（保留 margin 方案，不使用 gap） */
.ov-dl__op + .ov-dl__op {
  margin-left: 6px;
}

/* 菜单项 hover/键盘高亮外的降级：pointermove 已切高亮，无系统 :hover 依赖 */
.ov-menu__item:focus {
  outline: none;
}
</style>

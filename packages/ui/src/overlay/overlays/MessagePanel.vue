<script setup lang="ts">
import type { DownloadTask } from '@desktop/shared'
import { formatBytes } from '@desktop/shared'
import { ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from 'reka-ui'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * 右上角消息面板（panel 窗渲染分支）：下载通知卡 + 通知 toast（reka Toast：悬停暂停 / 滑动关闭 / 单条 ×）。
 * 透明窗鼠标穿透联动：按命中元素切换穿透（命中 body = 透明区 → 穿透），命中卡片/按钮才接管；
 * 内容变化量「自然内容高度」回报 Main 调整窗口尺寸，超高内部滚动 + 自动滚到底。
 */
const store = useOverlayStore()

const STATUS_TEXT: Record<DownloadTask['status'], string> = {
  progressing: '下载中',
  completed: '已完成',
  cancelled: '已取消',
  interrupted: '已中断',
}

/** 下载卡片图标底色（按状态）：进行中青玉 / 完成绿 / 失败红 */
const DL_ICON_BG: Record<DownloadTask['status'], string> = {
  progressing: 'bg-[#0f766e]',
  completed: 'bg-[#16a34a]',
  cancelled: 'bg-[#dc2626]',
  interrupted: 'bg-[#dc2626]',
}

/** reka Toast 的关闭事件统一走 Main（控制态由 Main 数据推导，页面不私存） */
function onToastOpenChange(toastId: string, value: boolean): void {
  if (!value) {
    store.dismissToast(toastId)
  }
}

/**
 * 透明窗鼠标穿透联动：Windows 透明窗整个 bounds 命中鼠标，面板视觉只占右上角——
 * 按命中元素切换穿透（命中 body = 透明区 → 穿透），透明区不遮挡下层页面点击。
 * 面板容器本身 pointer-events:none，命中卡片/按钮才接管（阴影余量也能点穿）。
 * ignore 模式下 forward:true 让页面仍收 mousemove，可感知重新进入卡片。
 */
let lastIgnore: boolean | null = null
function onMouseMove(e: MouseEvent): void {
  const transparent = e.target === document.body || e.target === document.documentElement
  if (transparent === lastIgnore) {
    return
  }
  lastIgnore = transparent
  void window.desktop.overlay.ignoreMouse(transparent)
}

/**
 * 面板高度回报：量「自然内容高度」而非裁剪后高度——
 * 面板超高时内部滚动（max-h + overflow），若回报裁剪值窗口会收缩死循环
 */
const PANEL_MARGIN = 12
const panelRef = ref<HTMLElement | null>(null)

function reportHeight(): void {
  const panel = panelRef.value
  if (!panel) {
    return
  }
  void window.desktop.overlay.resize(panel.scrollHeight + PANEL_MARGIN * 2)
}

/** 面板超高内部滚动时新 toast 在底部：追加后自动滚到底，保证最新通知可见 */
function scrollPanelToBottom(): void {
  const panel = panelRef.value
  if (panel) {
    panel.scrollTop = panel.scrollHeight
  }
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
})

// 消息窗内容变化 → 量高回报 + 滚到底
watch(() => [store.toasts, store.downloads], () => {
  void nextTick(() => {
    reportHeight()
    scrollPanelToBottom()
  })
}, { deep: true })
</script>

<template>
  <ToastProvider :duration="8000" label="平台通知">
    <!-- 右上角消息区：容器穿透（pointer-events-none），命中卡片才接管；超高内部滚动不超出软件区域 -->
    <div
      v-if="store.hasPanelContent"
      ref="panelRef"
      class="ov-panel relative m-[12px] flex max-h-[calc(100vh-24px)] w-[320px] flex-col overflow-y-auto pointer-events-none"
    >
      <!-- 下载通知卡：与通知 toast 同款外观，逐条独立（不聚合）；终态 8s 自动消失，× 手动关闭 -->
      <div
        v-for="task in store.downloads"
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
            <button class="ov-dl__op flex-none cursor-pointer rounded-[6px] border border-[#d5dae1] bg-white px-[10px] py-[3px] text-[11px] text-[#1f2328] transition-colors duration-[120ms] hover:border-[#0f766e] hover:text-[#0f766e]" @click="store.openTask(task.id)">
              打开
            </button>
            <button class="ov-dl__op flex-none cursor-pointer rounded-[6px] border border-[#d5dae1] bg-white px-[10px] py-[3px] text-[11px] text-[#1f2328] transition-colors duration-[120ms] hover:border-[#0f766e] hover:text-[#0f766e]" @click="store.revealTask(task.id)">
              文件夹
            </button>
          </div>
        </div>
        <button
          class="ov-dl__close absolute right-[6px] top-[6px] h-[18px] w-[18px] cursor-pointer border-none bg-transparent p-0 text-[12px] leading-[18px] text-[#8a919c] transition-colors duration-[120ms] hover:text-[#1f2328]"
          @click="store.dismissDownload(task.id)"
        >
          ×
        </button>
      </div>
      <ToastViewport
        class="ov-panel__toasts m-0 flex-none list-none p-0 [&>*+*]:mt-2"
      >
        <ToastRoot
          v-for="toast in store.toasts"
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

<style scoped>
/* 面板超高内部滚动：隐藏滚动条（窗口高度贴合内容，只有极端堆积才滚动，滚动条无视觉意义） */
.ov-panel {
  scrollbar-width: none;
}
.ov-panel::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 相邻操作按钮间距（保留 margin 方案，不使用 gap） */
.ov-dl__op + .ov-dl__op {
  margin-left: 6px;
}
</style>

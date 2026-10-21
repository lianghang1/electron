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
 * 样式全部 scoped 自包含：本包须可在任意宿主应用复用，不依赖宿主的 UnoCSS 管线。
 */
const store = useOverlayStore()

const STATUS_TEXT: Record<DownloadTask['status'], string> = {
  progressing: '下载中',
  completed: '已完成',
  cancelled: '已取消',
  interrupted: '已中断',
}

/** 下载卡片图标底色（按状态）：进行中青玉 / 完成绿 / 失败红 */
const DL_ICON_CLASS: Record<DownloadTask['status'], string> = {
  progressing: 'ov-dl__icon--progressing',
  completed: 'ov-dl__icon--completed',
  cancelled: 'ov-dl__icon--failed',
  interrupted: 'ov-dl__icon--failed',
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
      class="ov-panel"
    >
      <!-- 下载通知卡：与通知 toast 同款外观，逐条独立（不聚合）；终态 8s 自动消失，× 手动关闭 -->
      <div
        v-for="task in store.downloads"
        :key="task.id"
        class="ov-dl ov-anim-slide"
        :title="task.path"
      >
        <span class="ov-dl__icon" :class="DL_ICON_CLASS[task.status]">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
        </span>
        <div class="ov-dl__main">
          <p class="ov-dl__name">
            {{ task.filename }}
          </p>
          <p class="ov-dl__desc">
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
            class="ov-dl__track"
          >
            <div class="ov-dl__bar" :style="{ width: `${task.percent}%` }" />
          </div>
          <div v-if="task.status === 'completed'" class="ov-dl__ops">
            <button class="ov-dl__op" @click="store.openTask(task.id)">
              打开
            </button>
            <button class="ov-dl__op" @click="store.revealTask(task.id)">
              文件夹
            </button>
          </div>
        </div>
        <button
          class="ov-dl__close"
          @click="store.dismissDownload(task.id)"
        >
          ×
        </button>
      </div>
      <ToastViewport class="ov-panel__toasts">
        <ToastRoot
          v-for="toast in store.toasts"
          :key="toast.id"
          :open="true"
          :duration="8000"
          class="ov-toast ov-anim-slide"
          @update:open="value => onToastOpenChange(toast.id, value)"
        >
          <span class="ov-toast__icon">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          </span>
          <div class="ov-toast__main">
            <p class="ov-toast__app">
              {{ toast.appName }}
            </p>
            <ToastTitle class="ov-toast__title">
              {{ toast.title }}
            </ToastTitle>
            <ToastDescription v-if="toast.body" class="ov-toast__body">
              {{ toast.body }}
            </ToastDescription>
          </div>
          <ToastClose class="ov-toast__close">
            ×
          </ToastClose>
        </ToastRoot>
      </ToastViewport>
    </div>
  </ToastProvider>
</template>

<style scoped>
.ov-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 320px;
  max-height: calc(100vh - 24px);
  margin: 12px;
  overflow-y: auto;
  pointer-events: none;
  /* 面板超高内部滚动：隐藏滚动条（窗口高度贴合内容，只有极端堆积才滚动，滚动条无视觉意义） */
  scrollbar-width: none;
}

.ov-panel::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* ---- 下载通知卡 ---- */
.ov-dl {
  position: relative;
  display: flex;
  flex: none;
  margin-bottom: 8px;
  padding: 9px 12px 10px;
  border: 1px solid rgba(2, 8, 20, 0.1);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(2, 8, 20, 0.08);
  pointer-events: auto;
}

.ov-dl__icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-top: 2px;
  margin-right: 8px;
  border-radius: 7px;
  color: #fff;
}

.ov-dl__icon--progressing {
  background: #0f766e;
}

.ov-dl__icon--completed {
  background: #16a34a;
}

.ov-dl__icon--failed {
  background: #dc2626;
}

.ov-dl__main {
  flex: 1;
  min-width: 0;
}

.ov-dl__name {
  margin: 0;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  color: #1f2328;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ov-dl__desc {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: #57606a;
}

.ov-dl__track {
  width: 100%;
  height: 4px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 2px;
  background: #e8ecf1;
}

.ov-dl__bar {
  height: 100%;
  border-radius: 2px;
  background: #0f766e;
  transition: width 0.2s;
}

.ov-dl__ops {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.ov-dl__op {
  flex: none;
  padding: 3px 10px;
  border: 1px solid #d5dae1;
  border-radius: 6px;
  background: #fff;
  color: #1f2328;
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}

.ov-dl__op:hover {
  border-color: #0f766e;
  color: #0f766e;
}

.ov-dl__close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: #8a919c;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  transition: color 0.12s;
}

.ov-dl__close:hover {
  color: #1f2328;
}
</style>

<!-- 全局块（非 scoped）：ToastRoot/ToastViewport 经 reka 组件链（Presence/Transition 多级）渲染，
     元素不继承本组件的 data-v 属性，scoped 选择器匹配不上（表现为通知卡无背景/圆角/阴影）；
     与 AppTooltip.vue 的 dt- 处理同款，ov- 前缀已命名空间化，无污染风险 -->
<style>
/* ---- 通知 toast（reka Toast）---- */
.ov-panel__toasts {
  flex: none;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ov-toast + .ov-toast {
  margin-top: 8px;
}

.ov-toast {
  position: relative;
  display: flex;
  padding: 9px 12px 10px;
  border: 1px solid rgba(2, 8, 20, 0.1);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(2, 8, 20, 0.08);
  pointer-events: auto;
}

.ov-toast__icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-top: 2px;
  margin-right: 8px;
  border-radius: 7px;
  background: #0f766e;
  color: #fff;
}

.ov-toast__main {
  flex: 1;
  min-width: 0;
}

.ov-toast__app {
  margin: 0;
  font-size: 11px;
  color: #8a919c;
}

.ov-toast__title {
  margin: 2px 0 0;
  font-size: 12.5px;
  font-weight: 600;
  color: #1f2328;
}

.ov-toast__body {
  margin: 2px 0 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: #57606a;
}

.ov-toast__close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: #8a919c;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  transition: color 0.12s;
}

.ov-toast__close:hover {
  color: #1f2328;
}
</style>

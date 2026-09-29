<script setup lang="ts">
import type { DownloadTask, OverlayMenuConfig, OverlayMenuItem, PermissionRequest, PlatformNotification } from '@desktop/shared'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatBytes } from '../composables/use-downloads'
import { permissionLabel } from '../composables/use-permission-labels'

/**
 * 浮层页（OverlayWindow 的 renderer，经 #/overlay 路由挂载）：
 * 原生层级压过 WebContentsView，Shell DOM 不再承载全局浮层。
 * 同一份页面服务三类浮层窗（每窗同时只收一种消息，互斥渲染）：
 * - 菜单窗：overlay:show 菜单（Main 预算好窗口尺寸，无需量高回报）
 * - 消息窗：download:updated 下载面板 + notification:received 通知 toast（右下角）
 * - 弹窗窗：permission:pending 运行时授权决策卡（屏幕居中）
 * 内容高度动态的浮层窗（消息/弹窗），渲染后量高回报（overlay:resize），Main 据此调整窗口。
 */
const menu = ref<OverlayMenuConfig | null>(null)
const toasts = ref<PlatformNotification[]>([])
const downloads = ref<DownloadTask[]>([])
const dialogs = ref<PermissionRequest[]>([])

const STATUS_TEXT: Record<DownloadTask['status'], string> = {
  progressing: '下载中',
  completed: '已完成',
  cancelled: '已取消',
  interrupted: '已中断',
}

/** 弹窗窗可见 = 有挂起请求；消息窗内容 = 下载面板 + 通知堆叠 */
const hasPanelContent = computed(() => downloads.value.length > 0 || toasts.value.length > 0)

async function onMenuItem(item: OverlayMenuItem): Promise<void> {
  await window.desktop.overlay.action(item.id)
}

async function respond(requestId: string, granted: boolean): Promise<void> {
  await window.desktop.permission.respond(requestId, granted)
  // 列表更新由 Main 统一推送（permission:pending），页面无需本地移除
}

function reportHeight(): void {
  // 12px 阴影余量含在页面高度内（内容块 margin），Main 直接用回报值设窗口高
  void window.desktop.overlay.resize(document.documentElement.scrollHeight)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape')
    void window.desktop.overlay.hideMenu()
}

const unsubs: Array<() => void> = []

onMounted(async () => {
  unsubs.push(
    window.desktop.events.on('overlay:show', (value) => {
      menu.value = value
      document.documentElement.dataset.theme = value.theme
    }),
    window.desktop.events.on('notification:received', (list) => {
      toasts.value = list
    }),
    window.desktop.events.on('download:updated', (list) => {
      downloads.value = list
    }),
    window.desktop.events.on('permission:pending', (list) => {
      dialogs.value = list
    }),
  )
  window.addEventListener('keydown', onKeydown)
  // 主动拉取当前状态：Main 推送可能早于本页事件订阅（did-finish-load ≠ Vue mounted）
  const state = await window.desktop.overlay.sync()
  if (state.menu) {
    menu.value = state.menu
    document.documentElement.dataset.theme = state.menu.theme
  }
  toasts.value = state.toasts
  downloads.value = state.downloads
  dialogs.value = state.dialogs
})

onBeforeUnmount(() => {
  for (const off of unsubs) off()
  window.removeEventListener('keydown', onKeydown)
})

// 内容变化 → 量高回报（菜单窗尺寸由 Main 预算，不参与）
watch([toasts, downloads, dialogs], () => {
  void nextTick(reportHeight)
}, { deep: true })
</script>

<template>
  <!-- 菜单浮层：窗口本体透明；菜单块留 12px 外边距承载阴影（与 Main 的 SHADOW 一一对应） -->
  <Transition name="ov-menu" appear>
    <div v-if="menu" class="ov-menu">
      <template v-for="item in menu.items" :key="item.id">
        <div v-if="item.separatorBefore" class="ov-menu__sep" />
        <button
          class="ov-menu__item"
          :class="{ 'ov-menu__item--danger': item.danger }"
          @click="onMenuItem(item)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </Transition>

  <!-- 权限弹窗：居中决策卡，逐条决策或 30 秒超时按拒绝 -->
  <div v-if="dialogs.length" class="ov-dialog">
    <p class="ov-dialog__title">
      权限请求
    </p>
    <div v-for="request in dialogs" :key="request.requestId" class="ov-dialog__row">
      <p class="ov-dialog__text">
        <strong>{{ request.appName }}</strong> 请求使用「{{ permissionLabel(request.permission) }}」
      </p>
      <div class="ov-dialog__actions">
        <button class="ov-btn" @click="respond(request.requestId, false)">
          拒绝
        </button>
        <button class="ov-btn ov-btn--primary" @click="respond(request.requestId, true)">
          允许
        </button>
      </div>
    </div>
  </div>

  <!-- 右下角消息区：下载面板 + 通知 toast 堆叠 -->
  <div v-if="hasPanelContent" class="ov-panel">
    <div v-if="downloads.length" class="ov-panel__block">
      <p class="ov-panel__head">
        下载
      </p>
      <div v-for="task in downloads" :key="task.id" class="ov-dl" :title="task.path">
        <span class="ov-dl__dot" :class="`ov-dl__dot--${task.status}`" />
        <div class="ov-dl__info">
          <span class="ov-dl__name">{{ task.filename }}</span>
          <span class="ov-dl__desc">
            {{ STATUS_TEXT[task.status] }}
            <template v-if="task.status === 'progressing' && task.percent >= 0"> · {{ task.percent }}%</template>
            <template v-if="task.total > 0"> · {{ formatBytes(task.total) }}</template>
          </span>
        </div>
        <div v-if="task.status === 'progressing' && task.percent >= 0" class="ov-dl__track">
          <div class="ov-dl__bar" :style="{ width: `${task.percent}%` }" />
        </div>
      </div>
    </div>
    <div v-for="toast in toasts" :key="toast.id" class="ov-toast">
      <p class="ov-toast__app">
        {{ toast.appName }}
      </p>
      <p class="ov-toast__title">
        {{ toast.title }}
      </p>
      <p v-if="toast.body" class="ov-toast__body">
        {{ toast.body }}
      </p>
    </div>
  </div>
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
</style>

<style scoped>
.ov-menu {
  width: 180px;
  margin: 12px;
  padding: 4px;
  background: var(--dt-surface);
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-3);
  box-shadow: var(--dt-shadow-menu);
  box-sizing: border-box;
}
.ov-menu__item {
  display: block;
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: none;
  background: transparent;
  border-radius: var(--dt-radius-1);
  font-size: 12.5px;
  font-family: inherit;
  color: var(--dt-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.ov-menu__item:hover {
  background: var(--dt-hover);
}
.ov-menu__item--danger {
  color: var(--dt-danger-text);
}
.ov-menu__sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--dt-line-soft);
}

/* ---- 权限弹窗 ---- */
.ov-dialog {
  width: 400px;
  margin: 12px;
  background: var(--dt-surface);
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-3);
  box-shadow: var(--dt-shadow-menu);
  box-sizing: border-box;
  padding: 14px 16px;
}
.ov-dialog__title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dt-text);
}
.ov-dialog__row {
  padding: 10px 0 0;
  border-top: 1px solid var(--dt-line-soft);
}
.ov-dialog__text {
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--dt-text-2);
}
.ov-dialog__text strong {
  color: var(--dt-text);
  font-weight: 600;
}
.ov-dialog__actions {
  display: flex;
  justify-content: flex-end;
}
.ov-btn {
  height: 28px;
  padding: 0 14px;
  margin-left: 8px;
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-2);
  background: var(--dt-surface);
  font-size: 12px;
  font-family: inherit;
  color: var(--dt-text);
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease), border-color var(--dt-dur) var(--dt-ease);
}
.ov-btn:hover {
  background: var(--dt-hover);
}
.ov-btn--primary {
  background: var(--dt-brand);
  border-color: var(--dt-brand);
  color: #fff;
}
.ov-btn--primary:hover {
  opacity: 0.9;
  background: var(--dt-brand);
}

/* ---- 右下角消息区 ---- */
.ov-panel {
  width: 320px;
  margin: 12px;
  display: flex;
  flex-direction: column;
}
.ov-panel__block {
  background: var(--dt-surface);
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-3);
  box-shadow: var(--dt-shadow-menu);
  overflow: hidden;
}
.ov-panel__block + .ov-toast {
  margin-top: 8px;
}
.ov-panel__head {
  margin: 0;
  padding: 8px 12px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--dt-text-2);
}
.ov-dl {
  display: flex;
  align-items: center;
  padding: 8px 12px;
}
.ov-dl__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 10px;
  flex: none;
  background: var(--dt-text-3);
}
.ov-dl__dot--progressing {
  background: var(--dt-brand);
}
.ov-dl__dot--completed {
  background: var(--dt-success);
}
.ov-dl__dot--interrupted,
.ov-dl__dot--cancelled {
  background: var(--dt-danger);
}
.ov-dl__info {
  width: 210px;
  flex: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ov-dl__name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--dt-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ov-dl__desc {
  font-size: 11.5px;
  color: var(--dt-text-2);
}
.ov-dl__track {
  flex: 1;
  height: 4px;
  margin-left: 12px;
  border-radius: 2px;
  background: var(--dt-hover);
  overflow: hidden;
}
.ov-dl__bar {
  height: 100%;
  border-radius: 2px;
  background: var(--dt-brand);
  transition: width var(--dt-dur) var(--dt-ease);
}
.ov-toast {
  background: var(--dt-surface);
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-3);
  box-shadow: var(--dt-shadow-menu);
  padding: 9px 12px 10px;
}
.ov-toast + .ov-toast {
  margin-top: 8px;
}
.ov-toast__app {
  margin: 0;
  font-size: 11px;
  color: var(--dt-text-3);
}
.ov-toast__title {
  margin: 2px 0 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dt-text);
}
.ov-toast__body {
  margin: 2px 0 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--dt-text-2);
}

.ov-menu-enter-active {
  transition: opacity var(--dt-dur) var(--dt-ease), transform var(--dt-dur) var(--dt-ease);
}
.ov-menu-enter-from {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>

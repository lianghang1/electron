<script setup lang="ts">
import type { DownloadTask } from '@shell/shared'
import type { OverlayAction, OverlayKind } from '@shell/shared/ipc'
import { shell } from '@shell/bridge/client'
import { ref, watch } from 'vue'

const { state, kind, plane, permission, interactiveOpen } = useOverlayState()

/** 命令面板数据按需拉取：paletteOpen 才拉（应用中心清单由 AppCenter 自取） */
interface AppSummary {
  manifest: { id: string, name: string }
}
const paletteItems = ref<{ id: string, name: string, kind: string }[]>([])

watch(() => plane.value?.paletteOpen, async (open) => {
  if (!open) { return }
  try {
    const list = await shell().apps.list() as AppSummary[]
    paletteItems.value = list.map(a => ({ id: a.manifest.id, name: a.manifest.name, kind: 'app' }))
  }
  catch {
    paletteItems.value = []
  }
})

/** 权限结论上抛：先取快照，避免模板回调里对 permission 非空断言 */
function resolvePermission(granted: boolean): void {
  const p = permission.value
  if (!p) { return }
  action('resolve-permission', { requestId: p.requestId, granted })
}

/** 浮层内取消：走 captureDialog.close 清发起方账本并回传空结果，overlay.dismiss 只收场不清账 */
function cancelCapture(): void {
  void shell().captureDialog.close()
  close('capture')
}

function action(type: OverlayAction['type'], extra: Omit<OverlayAction, 'kind' | 'type'> = {}): void {
  void shell().overlay.action({ kind: actionKind(type), type, ...extra })
}

/** 动作寻址：权限结论发给 permission 表面，其余按当前打开的表面归位 */
function actionKind(type: OverlayAction['type']): OverlayKind {
  if (type === 'resolve-permission') { return 'permission' }
  if (type === 'select-menu') { return 'menu' }
  if (type === 'close-capture') { return 'capture' }
  return 'app-center'
}

function close(target: OverlayKind): void {
  void shell().overlay.dismiss(target)
}

async function openApp(appId: string): Promise<void> {
  await shell().apps.open(appId)
  close('app-center')
}

function dismissNotification(id: string): void {
  void shell().notifications.dismiss(id)
}

function clearNotifications(): void {
  void shell().notifications.clear()
}

function dismissDownload(taskId: string): void {
  void shell().downloads.dismiss(taskId)
}

async function openDownload(taskId: string): Promise<void> {
  await shell().downloads.open(taskId)
}

function revealDownload(taskId: string): void {
  void shell().downloads.reveal(taskId)
}

function relaunch(): void {
  shell().shell.relaunch()
}

/**
 * toast 独占时 plane 整面穿透（WebContentsView 无逐像素命中），卡片悬停临时拦截，
 * 离开即交还；交互表面在列时 plane 本就收全量鼠标，悬停切换是空操作
 */
function cardHover(hovering: boolean): void {
  if (!interactiveOpen.value) { shell().overlay.mouseIgnore(!hovering) }
}
</script>

<template>
  <div class="relative h-full w-full">
    <!-- 独立浮层窗：拍摄会话（可拖动卡片窗，卡片自持落位 + header 拖动区） -->
    <template v-if="kind === 'capture' && state?.capture">
      <CaptureDialog
        :key="state.capture.sessionId"
        :session="state.capture"
        @close="cancelCapture"
      />
    </template>

    <!-- 独立浮层窗：设置（可拖动卡片窗，同拍摄） -->
    <template v-else-if="kind === 'settings'">
      <SettingsDialog :open="true" @update:open="close('settings')" />
    </template>

    <!-- 通知平面：toast 堆叠 + 交互表面，全部平面内渲染 -->
    <template v-else-if="kind === 'plane' && plane">
      <OverlayToastStack
        v-if="plane.notifications.length || plane.downloads.length"
        :notifications="plane.notifications"
        :downloads="plane.downloads as DownloadTask[]"
        @hover="cardHover"
        @dismiss-notification="dismissNotification"
        @clear-notifications="clearNotifications"
        @dismiss-download="dismissDownload"
        @open-download="openDownload"
        @reveal-download="revealDownload"
      />

      <OverlayPermissionCard
        v-if="permission"
        :permission="permission"
        @resolve="resolvePermission"
      />

      <OverlayTabMenu
        v-if="plane.menu"
        :menu="plane.menu"
        @select="a => action('select-menu', { action: a })"
        @close="close('menu')"
      />

      <OverlayAppCenter
        v-if="plane.appCenterOpen"
        :open="plane.appCenterOpen"
        @open-app="openApp"
        @close="close('app-center')"
      />

      <!-- 命令面板：omnibox 锚定下拉，自带遮罩与外点关闭 -->
      <OverlayCommandPalette
        :open="Boolean(plane.paletteOpen)"
        :items="paletteItems"
        :recent-ids="[]"
        @select="openApp"
        @update:open="close('command-palette')"
      />

      <OverlayUpdatePromptCard
        v-if="plane.updatePrompt"
        :version="plane.updatePrompt"
        @close="close('update-prompt')"
        @relaunch="relaunch"
      />

      <OverlayConfigCard
        v-if="plane.config"
        :category="plane.config"
        @close="close('config')"
      />
    </template>
  </div>
</template>

<style>
/* 浮层页面基座：透明背景 + 无边距（Shell 本体与浮层共用 index.html）。
   透明载体依赖页面自身透明——全局 tokens 的 body 底色会把透明面
   填成不透明色块，整块盖住下层内容（master OverlayApp.vue 同款基座） */
html,
body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
}

/* plane 内交互表面进出场：纯 CSS 过渡，显隐零握手 */
.plane-fade-enter-active,
.plane-fade-leave-active {
  transition: opacity 0.16s ease;
}
.plane-fade-enter-from,
.plane-fade-leave-to {
  opacity: 0;
}
</style>

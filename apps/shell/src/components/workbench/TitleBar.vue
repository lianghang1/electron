<script setup lang="ts">
import type { ShellTab } from '../../composables/use-shell-tabs'
import { Separator } from '@ui/components/separator'
import { Minus, RefreshCw, Settings, Square, X } from '@ui/lib/lucide'
import ShellTabBar from './ShellTabBar.vue'

/**
 * 平台档自适应标题栏：logo + tabs + 设置 + 窗口控制。
 * 组件不碰桥面：全部动作经事件上抛，由工作台页执行。
 */
defineProps<{
  tabs: ShellTab[]
  activeKey: string
}>()

defineEmits<{
  activate: [tab: ShellTab]
  close: [tab: ShellTab]
  move: [fromKey: string, toKey: string]
  openAppCenter: []
  reload: []
  openSettings: []
  minimize: []
  maximize: []
  closeWindow: []
}>()
</script>

<template>
  <header class="titlebar-drag flex h-9 items-center gap-1.5 border-b border-border px-2.5">
    <!-- 品牌标（壳不显示名称）；hairline 与 tab 区断开，logo 不再与首字徽标并排混淆 -->
    <svg class="brand-mark shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="currentColor" d="M6 6h15l14 14h6L27 6h15v36H6Z" />
    </svg>
    <Separator orientation="vertical" class="mx-0.5 h-4 shrink-0" />

    <ShellTabBar
      :tabs="tabs"
      :active-key="activeKey"
      @activate="$emit('activate', $event)"
      @close="$emit('close', $event)"
      @move="(fromKey, toKey) => $emit('move', fromKey, toKey)"
      @open-app-center="$emit('openAppCenter')"
    />

    <!-- tab 条占满剩余宽度（多了内部滚动），右侧控制区固定不被挤压；空白即拖拽区 -->
    <div class="flex shrink-0 items-center">
      <button class="ctrl flex h-8 w-9 items-center justify-center rounded-md text-foreground" aria-label="刷新当前应用" title="刷新当前应用" @click="$emit('reload')">
        <RefreshCw :size="14" />
      </button>
      <button class="ctrl flex h-8 w-9 items-center justify-center rounded-md text-foreground" aria-label="设置" @click="$emit('openSettings')">
        <Settings :size="15" />
      </button>
      <Separator orientation="vertical" class="mx-1 h-4" />
      <button class="ctrl flex h-8 w-10 items-center justify-center rounded-md text-foreground" aria-label="最小化" @click="$emit('minimize')">
        <Minus :size="14" />
      </button>
      <button class="ctrl flex h-8 w-10 items-center justify-center rounded-md text-foreground" aria-label="最大化" @click="$emit('maximize')">
        <Square :size="12" />
      </button>
      <button class="ctrl ctrl-close flex h-8 w-10 items-center justify-center rounded-md text-foreground" aria-label="关闭" @click="$emit('closeWindow')">
        <X :size="14" />
      </button>
    </div>
  </header>
</template>

<style scoped>
/* 自绘标题栏拖拽：整条标题栏都是拖拽区，可点组件必须显式豁免 */
.titlebar-drag {
  -webkit-app-region: drag;
}
.titlebar-drag :deep(button),
.titlebar-drag button,
.titlebar-drag input {
  -webkit-app-region: no-drag;
}

.brand-mark {
  width: 17px;
  height: 17px;
  color: var(--ring);
}

.ctrl {
  transition: background 0.12s ease;
}
.ctrl:hover {
  background: var(--accent);
}
.ctrl-close:hover {
  background: var(--destructive) !important;
  color: #fff !important;
}
</style>

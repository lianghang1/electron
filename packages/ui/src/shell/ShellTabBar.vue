<script setup lang="ts">
import type { ShellTab } from './use-shell-tabs'
import { Plus, X } from 'lucide-vue-next'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ tabs: ShellTab[], activeKey: string }>()
const emit = defineEmits<{
  activate: [tab: ShellTab]
  close: [tab: ShellTab]
  move: [fromKey: string, toKey: string]
  openPalette: []
}>()

const stripEl = ref<HTMLElement | null>(null)
const fadeStart = ref(false)
const fadeEnd = ref(false)
const draggingKey = ref<string | null>(null)
const dropTargetKey = ref<string | null>(null)

function updateFade() {
  const el = stripEl.value
  if (!el) {
    fadeStart.value = false
    fadeEnd.value = false
    return
  }
  fadeStart.value = el.scrollLeft > 1
  fadeEnd.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollActiveIntoView() {
  const strip = stripEl.value
  const active = strip?.querySelector<HTMLElement>('.tab-active')
  if (strip && active) { active.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
  updateFade()
}

watch(() => props.tabs.length, () => nextTick(updateFade))
watch(() => props.activeKey, () => nextTick(scrollActiveIntoView))

function onResize() {
  updateFade()
}

onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

function onDragStart(e: DragEvent, tab: ShellTab) {
  draggingKey.value = tab.key
  dropTargetKey.value = tab.key
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tab.key)
  }
}

function onDragOver(e: DragEvent, tab: ShellTab) {
  if (!draggingKey.value || draggingKey.value === tab.key) { return }
  e.preventDefault()
  if (e.dataTransfer) { e.dataTransfer.dropEffect = 'move' }
  dropTargetKey.value = tab.key
}

function onDrop(e: DragEvent, tab: ShellTab) {
  e.preventDefault()
  const from = draggingKey.value
  if (from && from !== tab.key) { emit('move', from, tab.key) }
  onDragEnd()
}

function onDragEnd() {
  draggingKey.value = null
  dropTargetKey.value = null
}
</script>

<template>
  <div
    ref="stripEl"
    class="tab-strip relative flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto"
    :class="{ 'fade-start': fadeStart, 'fade-end': fadeEnd }"
    @scroll="updateFade"
  >
    <div
      v-for="tab in tabs"
      :key="tab.key"
      class="tab group flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md px-2 text-ui-sm"
      :class="{
        'tab-active bg-accent text-accent-foreground font-medium': tab.key === activeKey,
        'tab-idle opacity-75': tab.key !== activeKey,
        'opacity-40': draggingKey === tab.key,
      }"
      draggable="true"
      @click="emit('activate', tab)"
      @dragstart="onDragStart($event, tab)"
      @dragover="onDragOver($event, tab)"
      @drop="onDrop($event, tab)"
      @dragend="onDragEnd"
    >
      <span class="size-3.5 shrink-0 rounded-sm" :style="{ background: tab.iconColor }" aria-hidden="true" />
      <span v-if="tab.key === activeKey" class="max-w-32 truncate">{{ tab.title }}</span>
      <span v-else class="sr-only">{{ tab.title }}</span>
      <button class="tab-close" :title="`关闭 ${tab.title}`" aria-label="关闭标签" @click.stop="emit('close', tab)">
        <X :size="11" />
      </button>
    </div>
    <button
      class="tab-plus flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
      title="打开应用（Ctrl+K）"
      aria-label="打开应用"
      @click="emit('openPalette')"
    >
      <Plus :size="14" />
    </button>
  </div>
</template>

<style scoped>
.tab-strip {
  scrollbar-width: none;
  padding-right: 4px;
}
.tab-strip::-webkit-scrollbar {
  display: none;
}
.tab-strip.fade-start {
  mask-image: linear-gradient(to right, transparent 0, #000 20px, #000 100%);
}
.tab-strip.fade-end {
  mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 20px), transparent 100%);
}
.tab-strip.fade-start.fade-end {
  mask-image: linear-gradient(to right, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%);
}

.tab {
  transition: background 0.15s ease, color 0.15s ease, opacity 0.12s ease;
  user-select: none;
  -webkit-app-region: no-drag;
}
.tab-idle:hover {
  background: var(--hover);
  opacity: 1;
}
.tab-close {
  display: grid;
  place-items: center;
  color: currentColor;
  border-radius: 4px;
  padding: 1.5px;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease;
}
.tab:hover .tab-close,
.tab-active .tab-close {
  opacity: 0.65;
}
.tab-close:hover {
  opacity: 1 !important;
  background: var(--hover);
}
.tab-plus {
  transition: background 0.12s ease, color 0.12s ease;
}
</style>

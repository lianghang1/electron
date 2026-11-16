<script setup lang="ts">
import { Kbd } from '@ui/components'
import { Search, X } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useAppCenter } from '../../composables/use-app-center'
import { colorFor } from '../../composables/use-shell-tabs'

/**
 * 应用中心：居中浮层，遮罩外点关闭；检索与键盘导航（Esc 关、/ 聚焦、↑↓ 选择、
 * Enter 打开）自包含——plane 无独立窗口焦点，交互表面在列时 Main 已把窗内
 * 焦点交给 plane，keydown 才能抵达。
 */
const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  openApp: [appId: string]
  close: []
}>()

const { apps, runningIds, searchQuery, searchInput, activeIdx, filteredApps, loadApps, navigate } = useAppCenter(() => props.open)

watch(() => props.open, (isOpen) => {
  if (isOpen) { void loadApps() }
})

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) { return }
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key === '/' && document.activeElement !== searchInput.value) {
    event.preventDefault()
    searchInput.value?.focus()
    return
  }
  if (navigate(event)) { return }
  if (event.key === 'Enter') {
    const target = filteredApps.value[activeIdx.value]
    if (target) { emit('openApp', target.manifest.id) }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="absolute inset-0 z-20 flex items-center justify-center" @click.self="$emit('close')">
    <div class="flex w-[324px] flex-col rounded-xl bg-popover p-4 shadow-lg">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-foreground">应用中心</span>
        <span class="text-xs text-muted-foreground">{{ apps.length }} 个应用</span>
        <span class="flex-1" />
        <button class="text-muted-foreground transition-colors hover:text-foreground" aria-label="关闭" @click="$emit('close')">
          <X :size="14" />
        </button>
      </div>
      <div class="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
        <Search :size="13" class="flex-none text-muted-foreground" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="搜索应用…"
          class="h-6 w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        >
        <Kbd v-if="!searchQuery" class="flex-none">
          /
        </Kbd>
      </div>
      <div v-if="filteredApps.length" class="mt-3 grid grid-cols-3 gap-1">
        <button
          v-for="(app, i) in filteredApps"
          :key="app.manifest.id"
          class="flex flex-col items-center gap-2 rounded-lg px-1 py-3 transition-colors hover:bg-accent"
          :class="i === activeIdx ? 'bg-accent' : ''"
          :title="`打开 ${app.manifest.name}`"
          @click="$emit('openApp', app.manifest.id)"
        >
          <span class="relative grid size-11 flex-none place-items-center rounded-lg" :style="{ background: colorFor(app.manifest.id) }" aria-hidden="true">
            <img v-if="app.manifest.icon" :src="app.manifest.icon" alt="" class="absolute inset-0 size-full rounded-lg object-cover">
            <span v-else class="text-lg font-semibold text-white">{{ app.manifest.name.slice(0, 1) }}</span>
            <span v-if="runningIds.includes(app.manifest.id)" class="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-popover" />
          </span>
          <span class="max-w-full truncate text-sm text-foreground">{{ app.manifest.name }}</span>
        </button>
      </div>
      <div v-else class="px-2 py-6 text-center text-sm text-muted-foreground">
        {{ apps.length ? '无匹配应用' : '暂无已注册应用' }}
      </div>
      <div class="mt-3 text-center text-xs text-muted-foreground">
        Enter 打开 · Esc 关闭 · ⌘K 命令面板
      </div>
    </div>
  </div>
</template>

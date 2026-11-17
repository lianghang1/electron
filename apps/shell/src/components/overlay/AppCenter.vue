<script setup lang="ts">
import { Button } from '@ui/components/button'
import { Kbd } from '@ui/components/kbd'
import { Search, X } from '@ui/lib/lucide'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useAppCenter } from '../../composables/use-app-center'
import { colorFor } from '../../composables/use-shell-tabs'

/**
 * 应用中心：dialog 表面面板本体（遮罩/居中/外点关闭由 SurfaceOutlet 容器配对）；
 * 检索、最近使用与键盘导航（Esc 关、/ 聚焦、↑↓ 选择、Enter 打开）自包含——
 * plane 无独立窗口焦点，交互表面在列时 Main 已把窗内焦点交给 plane，keydown 才能抵达。
 * recentIds 由壳页发起时经 present payload 注入（payload 即 props）。
 */
const props = defineProps<{
  recentIds?: string[]
}>()

const emit = defineEmits<{
  openApp: [appId: string]
  close: []
}>()

const { apps, runningIds, searchQuery, searchInput, activeIdx, recentApps, restApps, flatApps, loadApps, reset, navigate } = useAppCenter(computed(() => props.recentIds ?? []))

function onKeydown(event: KeyboardEvent): void {
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
    const target = flatApps.value[activeIdx.value]
    if (target) { emit('openApp', target.manifest.id) }
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  void reset()
  await loadApps()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="flex w-[420px] flex-col rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold text-foreground">应用中心</span>
      <span class="text-xs text-muted-foreground">{{ apps.length }} 个应用</span>
      <span class="flex-1" />
      <Button variant="ghost" size="icon-sm" aria-label="关闭应用中心" @click="$emit('close')">
        <X />
      </Button>
    </div>
    <div class="mt-3 flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-3">
      <Search :size="15" class="flex-none text-muted-foreground" />
      <input
        ref="searchInput"
        v-model="searchQuery"
        type="text"
        placeholder="搜索应用…"
        class="h-7 w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      >
      <Kbd v-if="!searchQuery" class="flex-none">
        /
      </Kbd>
    </div>

    <div v-if="flatApps.length" class="mt-3 max-h-[52vh] overflow-y-auto pr-0.5">
      <template v-if="recentApps.length">
        <p class="px-1 pb-1.5 pt-0.5 text-xs font-medium text-muted-foreground">
          最近使用
        </p>
        <div class="grid grid-cols-4 gap-1">
          <button
            v-for="(app, i) in recentApps"
            :key="app.manifest.id"
            class="app-tile flex flex-col items-center gap-2 rounded-lg px-1 py-3"
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
      </template>

      <p class="px-1 pb-1.5 text-xs font-medium text-muted-foreground" :class="recentApps.length ? 'pt-2.5' : 'pt-0.5'">
        {{ recentApps.length ? '全部应用' : '应用' }}
      </p>
      <div class="grid grid-cols-4 gap-1">
        <button
          v-for="(app, j) in restApps"
          :key="app.manifest.id"
          class="app-tile flex flex-col items-center gap-2 rounded-lg px-1 py-3"
          :class="recentApps.length + j === activeIdx ? 'bg-accent' : ''"
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
    </div>
    <div v-else class="px-2 py-8 text-center text-sm text-muted-foreground">
      {{ apps.length ? '无匹配应用' : '暂无已注册应用' }}
    </div>

    <div class="mt-3 flex items-center gap-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
      <span>↑↓ 选择</span>
      <span>Enter 打开</span>
      <span>Esc 关闭</span>
      <span class="ml-auto">Ctrl K 唤起</span>
    </div>
  </div>
</template>

<style scoped>
.app-tile {
  transition: background 0.12s ease;
}
.app-tile:hover {
  background: var(--accent);
}
</style>

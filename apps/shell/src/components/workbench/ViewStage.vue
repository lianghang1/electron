<script setup lang="ts">
import type { ShellTab } from '../../composables/use-shell-tabs'
import { useViewDock } from '../../composables/use-view-dock'
import EmptyState from '../common/EmptyState.vue'

/**
 * 视图舞台：底板恒存在（solo 铺满无边框 / platform 接缝圆角），落位上报只认 dockEl；
 * 上层叠 EmptyState（无页签）与垫场/失败兜底（加载全程与 intro 同一色源）。
 */
defineProps<{
  chrome: 'platform' | 'solo'
  activeTab: ShellTab | null | undefined
  viewState: 'loading' | 'failed' | null
}>()

defineEmits<{
  retry: []
}>()

const { dockEl } = useViewDock()
</script>

<template>
  <main class="relative min-h-0 flex-1 overflow-hidden" :class="chrome === 'solo' ? 'bg-background' : ''">
    <div class="h-full w-full overflow-hidden" :class="chrome === 'platform' ? 'p-1.5' : ''">
      <div
        ref="dockEl"
        class="h-full w-full overflow-hidden"
        :class="chrome === 'platform' ? 'rounded-xl border border-border bg-card' : ''"
      />
    </div>
    <!-- 定位包装层承载 absolute：EmptyState 根自带 relative，两个类同元素层叠时
         产物 CSS 里 .relative 排在 .absolute 后必胜出，组件会被顶出视口 -->
    <div v-if="chrome === 'platform' && !activeTab" class="absolute inset-0">
      <EmptyState />
    </div>
    <!-- 视图垫场/失败兜底：中性底色（品牌色大面积铺底过艳），形态与 platform dock
         卡片同构；失败不再展开 Chromium 白错误页，重试是交互出口 -->
    <div
      v-if="viewState"
      class="absolute inset-0"
      :class="chrome === 'platform' ? 'p-1.5' : ''"
    >
      <div
        class="grid h-full w-full place-items-center"
        :class="chrome === 'platform' ? 'rounded-xl border border-border bg-card' : 'bg-background'"
      >
        <div v-if="viewState === 'loading'" class="flex flex-col items-center gap-3 text-muted-foreground">
          <svg viewBox="0 0 24 24" width="28" height="28" class="animate-spin" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="44" />
          </svg>
          <p v-if="activeTab" class="text-sm">
            正在加载「{{ activeTab.title }}」…
          </p>
        </div>
        <div v-else class="flex flex-col items-center gap-4">
          <p class="text-lg font-medium text-foreground">
            页面加载失败
          </p>
          <button
            class="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            @click="$emit('retry')"
          >
            重试
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

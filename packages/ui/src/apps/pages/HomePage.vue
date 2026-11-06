<script setup lang="ts">
/**
 * 首页（embedded 融合页示例）：工作台欢迎页 + 平台状态摘要。
 * 展示 embedded 形态的标准写法：页面组件直接 window.desktop 调用，无视图容器。
 */
import { onMounted, ref } from 'vue'

const platform = ref<string>(navigator.platform)

onMounted(() => {
  platform.value = navigator.userAgent.includes('Win') ? 'Windows' : 'Other'
})
</script>

<template>
  <div class="h-full overflow-auto p-6" style="background: var(--dt-surface)">
    <h1 class="mb-1 text-xl font-semibold" style="color: var(--dt-text-1)">欢迎回来</h1>
    <p class="mb-6 text-sm" style="color: var(--dt-text-3)">壳平台 v2 · 工作台就绪</p>

    <div class="grid grid-cols-2 gap-3" style="max-width: 560px">
      <div class="rounded-xl p-4" style="background: var(--dt-glass); border: 1px solid var(--dt-line)">
        <p class="text-xs" style="color: var(--dt-text-3)">运行平台</p>
        <p class="mt-1 text-lg font-medium" style="color: var(--dt-text-1)">{{ platform }}</p>
      </div>
      <div class="rounded-xl p-4" style="background: var(--dt-glass); border: 1px solid var(--dt-line)">
        <p class="text-xs" style="color: var(--dt-text-3)">设备守护进程</p>
        <p class="mt-1 text-lg font-medium" style="color: #16a34a">自愈模式</p>
      </div>
    </div>

    <p class="mt-8 text-xs" style="color: var(--dt-text-3)">
      embedded 页面经 registerEmbeddedApp('/route', Component) 接入，manifest 指向路由即完成接入。
    </p>
  </div>
</template>

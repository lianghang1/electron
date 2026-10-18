<script setup lang="ts">
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
/**
 * 统一滚动区：reka-ui ScrollArea 封装（4px 细圆角滚动条、悬停容器浮现、不占布局槽位）。
 * 高度由使用方经 class/样式控制（组件自身撑满父容器），内容超高时出现滚动条。
 */
import { ref } from 'vue'

const viewportRef = ref<InstanceType<typeof ScrollAreaViewport> | null>(null)

defineExpose({
  /** 复位滚动位置（页签切换等场景） */
  reset(): void {
    const el = viewportRef.value?.$el as HTMLElement | undefined
    el?.scrollTo({ top: 0 })
  },
})
</script>

<template>
  <ScrollAreaRoot class="us-root">
    <ScrollAreaViewport ref="viewportRef" class="us-viewport">
      <div class="us-content">
        <slot />
      </div>
    </ScrollAreaViewport>
    <ScrollAreaScrollbar class="us-bar" orientation="vertical">
      <ScrollAreaThumb class="us-thumb" />
    </ScrollAreaScrollbar>
  </ScrollAreaRoot>
</template>

<style scoped>
.us-root {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.us-viewport {
  width: 100%;
  height: 100%;
}

.us-content {
  display: block;
  min-width: 100%;
}

.us-bar {
  display: flex;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 8px;
}

.us-thumb {
  flex: 1;
  border-right: 4px solid transparent;
  border-radius: 999px;
  background-color: transparent;
  background-clip: content-box;
  transition: background-color 0.15s;
}

/* 悬停容器才浮现拇指：避免滚动条突兀出现/消失 */
.us-root:hover .us-thumb {
  background-color: #d5dae1;
}

.us-root .us-thumb:hover {
  background-color: #c2cad4;
}
</style>

<script setup lang="ts">
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from 'reka-ui'
/**
 * 统一滚动区：reka-ui ScrollArea 封装（4px 细圆角滚动条、悬停容器浮现、不占布局槽位）。
 * 高度由使用方经 class/样式控制（组件自身撑满父容器），内容超高时出现滚动条。
 * 注意：Viewport/Scrollbar 内部节点拿不到父组件作用域 id（reka 组件为 Fragment 多根渲染），
 * 内部样式必须经 :deep 穿透，写在非 scoped 类选择器上不生效。
 */
import { ref } from 'vue'

const rootRef = ref<InstanceType<typeof ScrollAreaRoot> | null>(null)

defineExpose({
  /** 复位滚动位置（页签切换等场景）：ScrollAreaRoot 内建 scrollTop() 定位到顶部 */
  reset(): void {
    rootRef.value?.scrollTop()
  },
})
</script>

<template>
  <ScrollAreaRoot ref="rootRef" class="us-root">
    <ScrollAreaViewport class="us-viewport">
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

/* 内部节点无父作用域 id，选择器须经 .us-root + :deep 穿透 */
.us-root :deep(.us-viewport) {
  width: 100%;
  height: 100%;
  outline: none;
}

.us-root :deep(.us-content) {
  display: block;
  min-width: 100%;
}

.us-root :deep(.us-bar) {
  display: flex;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 8px;
  z-index: 1;
}

.us-root :deep(.us-thumb) {
  flex: 1;
  border-right: 4px solid transparent;
  border-radius: 999px;
  background-color: transparent;
  background-clip: content-box;
  transition: background-color 0.15s;
}

/* 悬停容器才浮现拇指：避免滚动条突兀出现/消失 */
.us-root:hover :deep(.us-thumb) {
  background-color: #d5dae1;
}

.us-root :deep(.us-thumb:hover) {
  background-color: #c2cad4;
}
</style>

<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { withDefaults } from 'vue'

/**
 * Shell 悬停提示：reka-ui Tooltip 原语封装（延迟显示、键盘聚焦可用、ESC 关闭），
 * 外观自绘为深底反白轻提示；触发元素经 as-child 透传，不改变原有交互结构。
 * 内容经 TooltipPortal 传送至 body：侧栏是滚动容器且与内容区为兄弟节点，
 * 原地渲染会被内容区遮挡；传送后脱离父级层叠上下文。
 */
withDefaults(defineProps<{
  text: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}>(), { side: 'right' })
</script>

<template>
  <TooltipProvider :delay-duration="350" :skip-delay-duration="200">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent :side="side" :side-offset="8" class="dt-tip">
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<!-- 全局块（非 scoped）：Portal 传送后内容元素不带 data-v 属性，scoped 选择器匹配不上；
     dt- 前缀已命名空间化，无污染风险 -->
<style>
.dt-tip {
  z-index: 80;
  max-width: 220px;
  padding: 4px 9px;
  border-radius: var(--dt-radius-1);
  background: var(--dt-tip-bg);
  color: var(--dt-tip-text);
  font-size: 12px;
  line-height: 1.5;
  box-shadow: var(--dt-shadow-pop);
  -webkit-app-region: no-drag;
  animation: dt-tip-in var(--dt-dur) var(--dt-ease);
}
@keyframes dt-tip-in {
  from {
    opacity: 0;
  }
}
</style>

<script setup lang="ts">
/**
 * Tooltip：悬浮提示（reka-ui 行为层：定位/延迟/无障碍）。
 * 用法：<DtTooltip text="说明"><button/></DtTooltip>
 */
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'

defineProps<{ text: string }>()
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="right"
          :side-offset="8"
          class="z-50 whitespace-nowrap px-2.5 py-1.5"
          style="background: #1c2433; color: #fff; font-size: var(--dt-font-caption); border-radius: 8px"
        >
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

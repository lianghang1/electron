<script setup lang="ts">
/**
 * Switch：开关（reka-ui 行为层：键盘切换 / 无障碍 checked 状态）。
 */
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const model = defineModel<boolean>({ default: false })
</script>

<template>
  <SwitchRoot
    v-model="model"
    class="relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors"
    :style="{ background: model ? 'var(--dt-accent)' : 'var(--dt-line)' }"
  >
    <SwitchThumb
      class="block size-4.5 rounded-full bg-white shadow transition-transform"
      :style="{ transform: model ? 'translateX(22px)' : 'translateX(2px)' }"
    />
  </SwitchRoot>
</template>

<script setup lang="ts">
import { Button } from '@ui/components'

/** 设备配置：居中卡片（JSAPI overlay.openConfig 的落点） */
defineProps<{
  category: string
}>()

defineEmits<{
  close: []
}>()
</script>

<template>
  <div class="absolute inset-0 z-20 flex items-center justify-center" @click.self="$emit('close')">
    <div class="w-[420px] rounded-xl bg-popover p-5 shadow-float">
      <div class="text-ui-base font-semibold text-foreground">
        设备配置
      </div>
      <div class="mt-2 text-ui-sm text-muted-foreground">
        类别：{{ category }}
      </div>
      <div class="mt-5 flex justify-end">
        <Button variant="outline" @click="$emit('close')">
          关闭
        </Button>
      </div>
    </div>
  </div>
</template>

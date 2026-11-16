<script setup lang="ts">
import { Button } from '@ui/components'

/** 更新提示：居中卡片，重启动作经事件上抛 */
defineProps<{
  version: string
}>()

defineEmits<{
  close: []
  relaunch: []
}>()
</script>

<template>
  <div class="absolute inset-0 z-20 flex items-center justify-center" @click.self="$emit('close')">
    <div class="w-[420px] rounded-xl bg-popover p-5 shadow-lg">
      <div class="text-sm font-semibold text-foreground">
        更新已就绪
      </div>
      <div class="mt-2 text-sm text-muted-foreground">
        版本 {{ version }} 需要重启后生效。
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button variant="outline" @click="$emit('close')">
          稍后
        </Button>
        <Button @click="$emit('relaunch')">
          立即重启
        </Button>
      </div>
    </div>
  </div>
</template>

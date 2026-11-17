<script setup lang="ts">
import { Button } from '@ui/components/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@ui/components/card'

/** 更新提示：dialog 表面内容卡，重启动作经事件上抛 */
defineProps<{
  version: string
}>()

defineEmits<{
  close: []
  relaunch: []
}>()
</script>

<template>
  <Card class="w-[420px] gap-4 shadow-lg">
    <CardHeader>
      <CardTitle>更新已就绪</CardTitle>
      <CardDescription>版本 {{ version }} 需要重启后生效。</CardDescription>
    </CardHeader>
    <CardFooter class="justify-end gap-2">
      <Button variant="outline" @click="$emit('close')">
        稍后
      </Button>
      <Button @click="$emit('relaunch')">
        立即重启
      </Button>
    </CardFooter>
  </Card>
</template>

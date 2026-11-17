<script setup lang="ts">
import { Button } from '@ui/components/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@ui/components/card'

/** 设备配置：dialog 表面内容卡（遮罩/居中/外点关闭由 SurfaceOutlet 容器配对） */
defineProps<{
  category: string
}>()

defineEmits<{
  close: []
}>()
</script>

<template>
  <Card class="w-[420px] gap-4 shadow-lg">
    <CardHeader>
      <CardTitle>设备配置</CardTitle>
      <CardDescription>类别：{{ category }}</CardDescription>
    </CardHeader>
    <CardFooter class="justify-end">
      <Button variant="outline" @click="$emit('close')">
        关闭
      </Button>
    </CardFooter>
  </Card>
</template>

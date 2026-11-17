<script setup lang="ts">
import type { PermissionView } from '../../overlay/types'
import { permissionLabel } from '@shell/shared'
import { Button } from '@ui/components/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@ui/components/card'
import { Progress } from '@ui/components/progress'
import { ShieldCheck } from '@ui/lib/lucide'
import { onBeforeUnmount, onMounted } from 'vue'
import { usePermissionCountdown } from '../../composables/use-permission-countdown'

/**
 * 权限请求：dialog 表面内容卡 + 倒计时条；外点不关闭（registry maskClose=false），
 * 必须显式决策或 ESC 拒绝（ESC 只在本卡在列时生效——组件挂载即权限在列）。
 */
const props = defineProps<{
  permission: PermissionView
}>()

const emit = defineEmits<{
  resolve: [granted: boolean]
}>()

const { countdown, requestTimeoutS, stop } = usePermissionCountdown(() => props.permission?.requestId)

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('resolve', false)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stop()
})
</script>

<template>
  <Card class="w-[400px] gap-4 shadow-lg">
    <CardHeader>
      <div class="flex items-center gap-2">
        <span class="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck :size="16" />
        </span>
        <CardTitle class="text-sm">
          权限请求
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent class="space-y-3">
      <p class="text-sm leading-relaxed text-muted-foreground">
        <span class="font-medium text-foreground">{{ permission.appName ?? permission.appId }}</span>
        请求使用「<span class="font-medium text-foreground">{{ permissionLabel(permission.permission) }}</span>」，请确认是否允许。
      </p>
      <div>
        <div class="flex items-baseline justify-between text-xs text-muted-foreground">
          <span><span class="font-semibold tabular-nums text-primary">{{ countdown }}</span> 秒内未处理将按本次拒绝</span>
          <span class="tabular-nums text-muted-foreground">{{ countdown }}s</span>
        </div>
        <Progress class="mt-1 h-1" :model-value="(countdown / requestTimeoutS) * 100" />
      </div>
    </CardContent>
    <CardFooter class="justify-end gap-2">
      <Button variant="outline" @click="emit('resolve', false)">
        拒绝
      </Button>
      <Button @click="emit('resolve', true)">
        允许
      </Button>
    </CardFooter>
  </Card>
</template>

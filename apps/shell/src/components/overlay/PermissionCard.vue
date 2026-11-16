<script setup lang="ts">
import type { PermissionView } from '../../overlay/types'
import { permissionLabel } from '@shell/shared'
import { Button } from '@ui/components'
import { onBeforeUnmount, onMounted } from 'vue'
import { usePermissionCountdown } from '../../composables/use-permission-countdown'

/**
 * 权限请求：居中大卡 + 遮罩 + 倒计时条；外点不关闭，必须显式决策或 ESC 拒绝
 * （ESC 只在本卡在列时生效——组件挂载即权限在列）。
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
  <div class="absolute inset-0 z-20 flex items-center justify-center bg-black/30">
    <div
      :key="permission.requestId"
      class="w-[400px] rounded-xl bg-popover p-5 shadow-lg"
    >
      <div class="flex items-center gap-2">
        <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        </span>
        <div class="text-sm font-semibold text-foreground">
          权限请求
        </div>
      </div>
      <div class="mt-2 text-sm leading-relaxed text-muted-foreground">
        <span class="font-medium text-foreground">{{ permission.appName ?? permission.appId }}</span>
        请求使用「<span class="font-medium text-foreground">{{ permissionLabel(permission.permission) }}</span>」，请确认是否允许。
      </div>
      <div class="mt-3">
        <div class="flex items-baseline justify-between text-xs text-muted-foreground">
          <span><span class="font-semibold tabular-nums text-primary">{{ countdown }}</span> 秒内未处理将按本次拒绝</span>
          <span class="tabular-nums text-muted-foreground">{{ countdown }}s</span>
        </div>
        <div class="mt-1 h-0.5 overflow-hidden rounded-full bg-accent">
          <div class="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" :style="{ width: `${(countdown / requestTimeoutS) * 100}%` }" />
        </div>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button variant="outline" @click="emit('resolve', false)">
          拒绝
        </Button>
        <Button @click="emit('resolve', true)">
          允许
        </Button>
      </div>
    </div>
  </div>
</template>

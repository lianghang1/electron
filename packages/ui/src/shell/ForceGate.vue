<script setup lang="ts">
import { desktop } from '@shell/bridge/client'
import { Button } from '@ui/components/ui'
import { RefreshCw } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 强制更新门禁：清单 minVersion 高于当前版本时整屏接管，仅提供更新出口。
 * 生命周期：阻断 → 更新中（updateNow）→ 需重启（restart-required）→ relaunch。
 */
const requiredVersion = ref('')
const phase = ref<'blocked' | 'updating' | 'restart-ready'>('blocked')
const updateError = ref('')

let offForce: (() => void) | undefined
let offRestart: (() => void) | undefined

function isStringPayload(value: unknown): value is { requiredVersion: string } {
  if (!value || typeof value !== 'object') { return false }
  return typeof (value as Record<string, unknown>).requiredVersion === 'string'
}

async function updateNow() {
  phase.value = 'updating'
  updateError.value = ''
  try {
    await desktop().shell.updateNow()
  }
  catch (err) {
    phase.value = 'blocked'
    updateError.value = String(err)
  }
}

onMounted(() => {
  offForce = desktop().onEvent('update.force-required', (payload) => {
    if (isStringPayload(payload)) {
      requiredVersion.value = payload.requiredVersion
      phase.value = 'blocked'
    }
  })
  offRestart = desktop().onEvent('update.restart-required', () => {
    phase.value = 'restart-ready'
  })
})

onBeforeUnmount(() => {
  offForce?.()
  offRestart?.()
})
</script>

<template>
  <div class="flex h-full w-full flex-col items-center justify-center gap-5 bg-background text-foreground">
    <div class="flex size-14 items-center justify-center rounded-icon bg-primary text-primary-foreground">
      <RefreshCw :size="26" :stroke-width="2" />
    </div>
    <div class="text-center">
      <p class="text-ui-xl font-semibold">
        需要更新后才能继续使用
      </p>
      <p class="mt-1.5 text-ui-sm text-foreground-subtle">
        当前版本低于最低可用版本 {{ requiredVersion ? requiredVersion : '' }}，更新完成后自动恢复
      </p>
    </div>
    <p v-if="updateError" class="text-ui-sm text-destructive">
      {{ updateError }}
    </p>
    <Button v-if="phase === 'restart-ready'" @click="desktop().shell.relaunch()">
      重启完成更新
    </Button>
    <Button v-else :disabled="phase === 'updating'" @click="updateNow()">
      {{ phase === 'updating' ? '正在下载更新…' : '立即更新' }}
    </Button>
  </div>
</template>

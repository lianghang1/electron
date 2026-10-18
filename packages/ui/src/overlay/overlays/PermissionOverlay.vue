<script setup lang="ts">
import { permissionLabel } from '@desktop/shared'
import { DialogContent, DialogDescription, DialogOverlay, DialogRoot, DialogTitle } from 'reka-ui'
import { onBeforeUnmount, reactive, watch } from 'vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * 权限决策浮层（dialog 窗渲染分支）：reka Dialog 承担模态遮罩 / 焦点圈养 / ESC，
 * 逐条决策（只渲染队首），ESC = 本次拒绝（贴近浏览器权限弹窗习惯），
 * 遮罩/卡片外点击不关闭（模态语义：必须显式决策或等待超时）。
 * 卡片样式固定高对比配色（不随 Shell 主题），保证任意背景下清晰可读。
 */
const store = useOverlayStore()

/** 决策卡倒计时秒数（与 Main 的 30s 超时一致，归零由 Main 按拒绝收尾） */
const REQUEST_TIMEOUT_S = 30
const countdowns = reactive<Record<string, number>>({})
let countdownTimer: ReturnType<typeof setInterval> | null = null

/** 弹窗列表变化 → 为新请求起 30s 倒计时，移除已决策请求的计时（用户要求超时倒数可见） */
function syncCountdowns(): void {
  for (const r of store.dialogs) {
    if (countdowns[r.requestId] == null) {
      countdowns[r.requestId] = REQUEST_TIMEOUT_S
    }
  }
  for (const id of Object.keys(countdowns)) {
    if (!store.dialogs.some(r => r.requestId === id)) {
      delete countdowns[id]
    }
  }
  if (store.dialogs.length && !countdownTimer) {
    countdownTimer = setInterval(() => {
      for (const r of store.dialogs) {
        if ((countdowns[r.requestId] ?? 0) > 0) {
          countdowns[r.requestId] = (countdowns[r.requestId] ?? 0) - 1
        }
      }
      if (!store.dialogs.length && countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }, 1000)
  }
}

watch(() => store.dialogs, syncCountdowns, { deep: true })

onBeforeUnmount(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
})

/** 遮罩/卡片外点击不关闭（模态语义：必须显式决策或等待超时） */
function keepDialogOpen(event: Event): void {
  event.preventDefault()
}

/** ESC = 本次拒绝（超时不持久化的语义一致） */
function onDialogEscape(event: KeyboardEvent): void {
  event.preventDefault()
  if (store.currentRequest) {
    store.respond(store.currentRequest.requestId, false)
  }
}

/** 决策按钮外观：主次按钮共用形状，颜色各给一份（避免同属性类级联冲突） */
function dialogBtnClass(primary: boolean): string {
  const base = 'ov-btn h-[32px] cursor-pointer rounded-[8px] border px-[18px] ml-[8px] text-[13px] font-500 font-[inherit] transition-colors duration-[120ms]'
  return primary
    ? `${base} ov-btn--primary border-[#0f766e] bg-[#0f766e] text-white hover:border-[#0d6a63] hover:bg-[#0d6a63]`
    : `${base} border-[#d5dae1] bg-white text-[#1f2328] hover:bg-[#f3f6f9]`
}
</script>

<template>
  <DialogRoot :open="store.currentRequest !== null">
    <DialogOverlay
      v-if="store.overlayVisible"
      class="ov-dialog fixed inset-0 z-[10] bg-[rgba(15,23,42,0.28)] ov-anim-fade"
    />
    <DialogContent
      class="fixed inset-0 z-[20] flex flex-col items-center justify-center"
      @escape-key-down="onDialogEscape"
      @pointer-down-outside="keepDialogOpen"
      @interact-outside="keepDialogOpen"
    >
      <div
        v-if="store.currentRequest && store.overlayVisible"
        :key="store.currentRequest.requestId"
        class="ov-dialog__card ov-anim-pop box-border w-[400px] rounded-[12px] border-x border-b border-x-[rgba(2,8,20,0.1)] border-b-[rgba(2,8,20,0.1)] bg-white px-[18px] pb-[14px] pt-[16px] shadow-[0_8px_24px_rgba(2,8,20,0.16)]"
      >
        <div class="ov-dialog__head mb-[10px] flex items-center">
          <span class="ov-dialog__icon mr-[8px] flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[8px] bg-[#0f766e] text-white">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          </span>
          <DialogTitle class="ov-dialog__title m-0 text-[14px] font-600 text-[#1f2328]">
            权限请求
          </DialogTitle>
        </div>
        <DialogDescription class="ov-dialog__text m-0 mb-[6px] text-[13px] leading-[1.6] text-[#57606a] [&_strong]:font-600 [&_strong]:text-[#1f2328]">
          <strong>{{ store.currentRequest.appName }}</strong> 请求使用「{{ permissionLabel(store.currentRequest.permission) }}」，请确认是否允许。
        </DialogDescription>
        <p class="ov-dialog__hint m-0 mb-[12px] text-[11.5px] text-[#8a919c]">
          <b class="ov-dialog__count font-600 text-[#0f766e] tabular-nums">{{ countdowns[store.currentRequest.requestId] ?? REQUEST_TIMEOUT_S }}</b> 秒内未处理将按本次拒绝，不影响下次使用
        </p>
        <div class="ov-dialog__actions flex justify-end">
          <button :class="dialogBtnClass(false)" @click="store.respond(store.currentRequest.requestId, false)">
            拒绝
          </button>
          <button :class="dialogBtnClass(true)" @click="store.respond(store.currentRequest.requestId, true)">
            允许
          </button>
        </div>
      </div>
    </DialogContent>
  </DialogRoot>
</template>

<style scoped>
/* 决策卡顶部品牌色描边（其余三边由 Uno 的 border-x/border-b 负责，避免同属性级联） */
.ov-dialog__card {
  border-top: 3px solid #0f766e;
}
</style>

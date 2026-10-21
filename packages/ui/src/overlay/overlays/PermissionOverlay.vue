<script setup lang="ts">
import { permissionLabel } from '@desktop/shared'
import { DialogContent, DialogDescription, DialogOverlay, DialogRoot, DialogTitle } from 'reka-ui'
import { onBeforeUnmount, reactive, watch } from 'vue'
import UiButton from '../../button/UiButton.vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * 权限决策浮层（dialog 窗渲染分支）：reka Dialog 承担模态遮罩 / 焦点圈养 / ESC，
 * 逐条决策（只渲染队首），ESC = 本次拒绝（贴近浏览器权限弹窗习惯），
 * 遮罩/卡片外点击不关闭（模态语义：必须显式决策或等待超时）。
 * 卡片样式固定高对比配色（不随 Shell 主题），保证任意背景下清晰可读。
 * 样式全部 scoped 自包含：本包须可在任意宿主应用复用，不依赖宿主的 UnoCSS 管线。
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
</script>

<template>
  <DialogRoot :open="store.currentRequest !== null">
    <DialogOverlay
      v-if="store.overlayVisible"
      class="ov-dialog ov-anim-fade"
    />
    <DialogContent
      class="ov-dialog__content"
      @escape-key-down="onDialogEscape"
      @pointer-down-outside="keepDialogOpen"
      @interact-outside="keepDialogOpen"
      @open-auto-focus.prevent
    >
      <div
        v-if="store.currentRequest && store.overlayVisible"
        :key="store.currentRequest.requestId"
        class="ov-dialog__card ov-anim-pop"
      >
        <div class="ov-dialog__head">
          <span class="ov-dialog__icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          </span>
          <DialogTitle class="ov-dialog__title">
            权限请求
          </DialogTitle>
        </div>
        <DialogDescription class="ov-dialog__text">
          <strong>{{ store.currentRequest.appName }}</strong> 请求使用「{{ permissionLabel(store.currentRequest.permission) }}」，请确认是否允许。
        </DialogDescription>
        <p class="ov-dialog__hint">
          <b class="ov-dialog__count">{{ countdowns[store.currentRequest.requestId] ?? REQUEST_TIMEOUT_S }}</b> 秒内未处理将按本次拒绝，不影响下次使用
        </p>
        <div class="ov-dialog__actions">
          <UiButton @click="store.respond(store.currentRequest.requestId, false)">
            拒绝
          </UiButton>
          <UiButton variant="primary" @click="store.respond(store.currentRequest.requestId, true)">
            允许
          </UiButton>
        </div>
      </div>
    </DialogContent>
  </DialogRoot>
</template>

<style scoped>
.ov-dialog {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: rgba(15, 23, 42, 0.28);
}

.ov-dialog__content {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.ov-dialog__card {
  box-sizing: border-box;
  width: 400px;
  padding: 16px 18px 14px;
  border: 1px solid rgba(2, 8, 20, 0.1);
  /* 顶部品牌色描边压住普通边框，形成决策卡的识别条 */
  border-top: 3px solid #0f766e;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(2, 8, 20, 0.16);
}

.ov-dialog__head {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.ov-dialog__icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-right: 8px;
  border-radius: 8px;
  background: #0f766e;
  color: #fff;
}

.ov-dialog__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2328;
}

.ov-dialog__text {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #57606a;
}

.ov-dialog__text strong {
  font-weight: 600;
  color: #1f2328;
}

.ov-dialog__hint {
  margin: 0 0 12px;
  font-size: 11.5px;
  color: #8a919c;
}

.ov-dialog__count {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #0f766e;
}

.ov-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

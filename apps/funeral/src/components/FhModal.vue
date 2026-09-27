<script setup lang="ts">
import { watch } from 'vue'

const props = withDefaults(defineProps<{
  visible: boolean
  type?: 'success' | 'error' | 'warning' | 'info'
  message: string
  title?: string
  confirmText?: string
  /** 自动关闭时长（ms），0 表示不自动关闭 */
  duration?: number
}>(), {
  type: 'info',
  title: '',
  confirmText: '知道了',
  duration: 0,
})

const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const TITLES: Record<'success' | 'error' | 'warning' | 'info', string> = {
  success: '操作成功',
  error: '操作失败',
  warning: '温馨提示',
  info: '提示',
}

let timer: ReturnType<typeof setTimeout> | null = null

function close(): void {
  emit('update:visible', false)
}

watch(() => props.visible, (visible) => {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (visible && props.duration > 0)
    timer = setTimeout(close, props.duration)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-modal">
      <div v-if="visible" class="fh-modal">
        <div class="fh-modal__mask" @click="close" />
        <div class="fh-modal__panel">
          <div class="fh-modal__icon" :class="`fh-modal__icon--${type}`">
            <svg v-if="type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
            <svg v-else-if="type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
            </svg>
            <svg v-else-if="type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M12 7v6" />
              <circle cx="12" cy="16.8" r="0.4" fill="currentColor" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M12 11v5" />
              <circle cx="12" cy="7.8" r="0.4" fill="currentColor" />
            </svg>
          </div>
          <h3 class="fh-modal__title">
            {{ title || TITLES[type] }}
          </h3>
          <p class="fh-modal__message">
            {{ message }}
          </p>
          <button class="fh-modal__btn" @click="close">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fh-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fh-modal__mask {
  position: absolute;
  inset: 0;
  background: rgb(30 40 58 / 45%);
}

.fh-modal__panel {
  position: relative;
  width: 380px;
  background: var(--fh-surface);
  border-radius: var(--fh-radius-lg);
  padding: 30px 32px 26px;
  text-align: center;
  box-shadow: var(--fh-shadow-float);
}

.fh-modal__icon {
  width: 62px;
  height: 62px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin: 0 auto 16px;
}

.fh-modal__icon svg {
  width: 30px;
  height: 30px;
}

.fh-modal__icon--success {
  background: var(--fh-success-soft);
  color: var(--fh-success);
}

.fh-modal__icon--error {
  background: var(--fh-danger-soft);
  color: var(--fh-danger);
}

.fh-modal__icon--warning {
  background: var(--fh-warn-soft);
  color: var(--fh-warn);
}

.fh-modal__icon--info {
  background: var(--fh-gold-soft);
  color: var(--fh-gold);
}

.fh-modal__title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
  color: var(--fh-text);
}

.fh-modal__message {
  margin: 0 0 24px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--fh-text-2);
}

.fh-modal__btn {
  min-width: 180px;
  height: 46px;
  border: none;
  border-radius: var(--fh-radius-sm);
  background: linear-gradient(160deg, var(--fh-cta-from) 0%, var(--fh-cta-to) 100%);
  color: var(--fh-cta-ink);
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s ease;
}

.fh-modal__btn:hover {
  filter: brightness(1.08);
}

.fh-modal-enter-active,
.fh-modal-leave-active {
  transition: opacity 0.2s ease;
}

.fh-modal-enter-active .fh-modal__panel,
.fh-modal-leave-active .fh-modal__panel {
  transition: transform 0.2s ease;
}

.fh-modal-enter-from,
.fh-modal-leave-to {
  opacity: 0;
}

.fh-modal-enter-from .fh-modal__panel,
.fh-modal-leave-to .fh-modal__panel {
  transform: scale(0.96);
}
</style>

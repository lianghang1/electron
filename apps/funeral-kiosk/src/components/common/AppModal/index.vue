<script setup lang="ts">
interface Props {
  visible: boolean
  type?: 'info' | 'success' | 'error' | 'warning'
  message: string
  confirmText?: string
  duration?: number
  showConfirm?: boolean
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'confirm'): void
  (e: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  confirmText: '知道了',
  duration: 5000,
  showConfirm: true,
})

const emit = defineEmits<Emits>()

const timer = ref<ReturnType<typeof setTimeout> | null>(null)
const isClosing = ref(false)

watch(() => props.visible, (newVal) => {
  if (newVal) {
    isClosing.value = false
    // 如果有设置自动关闭时间
    if (props.duration > 0) {
      if (timer.value) { clearTimeout(timer.value) }
      timer.value = setTimeout(() => {
        handleClose()
      }, props.duration)
    }
  }
})

onUnmounted(() => {
  if (timer.value) {
    clearTimeout(timer.value)
    timer.value = null
  }
})

function handleClose() {
  if (isClosing.value) { return }
  isClosing.value = true

  if (timer.value) {
    clearTimeout(timer.value)
    timer.value = null
  }

  emit('update:visible', false)
  emit('close')
}

function handleConfirm() {
  emit('confirm')
  handleClose()
}

function handleOverlayClick() {
  handleClose()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click="handleOverlayClick">
        <div class="modal-content" :class="type" @click.stop>
          <div class="modal-icon">
            <svg v-if="type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12l2.5 2.5L16 9" />
            </svg>
            <svg v-else-if="type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <svg v-else-if="type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <p class="modal-message">
            {{ message }}
          </p>
          <button v-if="showConfirm" class="modal-confirm-btn" @click="handleConfirm">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 20px;
  padding: 40px 48px;
  min-width: 320px;
  max-width: 420px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);

  &.success .modal-icon {
    color: #22c55e;
    background: #f0fdf4;
  }

  &.error .modal-icon {
    color: #ef4444;
    background: #fef2f2;
  }

  &.warning .modal-icon {
    color: #f59e0b;
    background: #fffbeb;
  }

  &.info .modal-icon {
    color: var(--v-color-primary);
    background: #eff6ff;
  }
}

.modal-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;

  svg {
    width: 36px;
    height: 36px;
  }
}

.modal-message {
  font-size: 18px;
  font-weight: 500;
  color: #1e293b;
  margin: 0 0 28px 0;
  line-height: 1.5;
}

.modal-confirm-btn {
  padding: 12px 40px;
  background: var(--v-color-primary-linear-gradient);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 53, 148, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
}

/* 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9);
  opacity: 0;
}
</style>

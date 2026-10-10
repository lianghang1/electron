<script setup lang="ts">
import type { Props } from './types'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<Props>(), {
  overlay: false,
  isVisible: false,
  type: 'error',
  title: '通知',
  message: '',
  autoClose: 3000,
  showProgressBar: true,
  closeOnOverlayClick: false,
})

const emit = defineEmits<Emits>()

// 定义事件
interface Emits {
  (e: 'update:isVisible', value: boolean): void
  (e: 'close'): void
  (e: 'timeout'): void
  (e: 'opened'): void
  (e: 'closed'): void
}

// 响应式数据
const closeTimer = ref<number | null>(null)
const progress = ref(100)
const startTime = ref(0)
const animationFrame = ref<number | null>(null)
const titleId = computed(() => `notification-title-${Math.random().toString(36).substr(2, 9)}`)
const messageId = computed(() => `notification-message-${Math.random().toString(36).substr(2, 9)}`)

const notificationClass = computed(() => props.type)
const showProgressBar = computed(() => props.showProgressBar && props.autoClose > 0)
const progressBarStyle = computed(() => ({
  width: `${progress.value}%`,
  transition: progress.value === 100 ? 'none' : 'width 100ms linear',
}))

function handleClose() {
  clearCloseTimer()
  emit('update:isVisible', false)
  emit('close')
  emit('closed')
}

function handleOverlayClick() {
  if (props.closeOnOverlayClick && props.overlay) {
    handleClose()
  }
}

// 清除关闭计时器
function clearCloseTimer() {
  if (closeTimer.value) {
    clearTimeout(closeTimer.value)
    closeTimer.value = null
  }
  if (animationFrame.value) {
    cancelAnimationFrame(animationFrame.value)
    animationFrame.value = null
  }
}

// 开始关闭计时器
function startCloseTimer() {
  clearCloseTimer()

  if (props.autoClose > 0) {
    // 设置总关闭时间
    closeTimer.value = setTimeout(() => {
      handleClose()
      emit('timeout')
    }, props.autoClose)

    // 如果显示进度条，启动动画
    if (props.showProgressBar) {
      startTime.value = Date.now()
      updateProgress()
    }
  }
}

// 更新进度条
function updateProgress() {
  if (!closeTimer.value)
    return

  const elapsed = Date.now() - startTime.value
  progress.value = Math.max(0, 100 - (elapsed / props.autoClose) * 100)

  if (progress.value > 0) {
    animationFrame.value = requestAnimationFrame(updateProgress)
  }
}

// 监听显示状态变化
watch(() => props.isVisible, (newVal, oldVal) => {
  if (newVal === oldVal)
    return

  if (newVal) {
    // 显示时重置进度并开始计时
    progress.value = 100
    startCloseTimer()
    emit('opened')

    // 下一个tick聚焦到通知区域
    nextTick(() => {
      const notification = document.querySelector('.error-notification')
      if (notification) {
        notification.setAttribute('tabindex', '0')
        ;(notification as HTMLElement).focus()
      }
    })
  }
  else {
    clearCloseTimer()
  }
}, { immediate: true })

watch(() => props.autoClose, () => {
  if (props.isVisible) {
    startCloseTimer()
  }
})

onUnmounted(() => {
  clearCloseTimer()
})
</script>

<template>
  <div
    v-if="isVisible"
    class="fun-notification"
    :class="{
      'error-notification-overlay': overlay,
    }"
    @click="handleOverlayClick"
  >
    <div
      class="error-notification"
      :class="notificationClass"
      role="alert"
      :aria-live="type === 'error' ? 'assertive' : 'polite'"
      @click.stop
    >
      <!-- 通知图标 -->
      <div class="error-icon" aria-hidden="true">
        <template v-if="type === 'error'">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </template>
        <template v-else-if="type === 'warning'">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </template>
        <template v-else-if="type === 'success'">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="8 12 12 16 20 8" />
          </svg>
        </template>
        <template v-else>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </template>
      </div>

      <!-- 通知内容 -->
      <div class="error-content">
        <h3 :id="titleId" class="error-title">
          {{ title }}
        </h3>
        <p :id="messageId" class="error-message">
          {{ message }}
        </p>
      </div>

      <!-- 关闭按钮 -->
      <button
        class="error-close"
        :aria-label="`关闭${title}`"
        :aria-describedby="messageId"
        @click="handleClose"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <!-- 进度条（如果启用了自动关闭） -->
      <div v-if="showProgressBar" class="error-progress">
        <div
          class="error-progress-bar"
          :class="type"
          :style="progressBarStyle"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.fun-notification {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
  z-index: 10000;
  animation: fadeIn 0.2s ease;
  pointer-events: auto;
}
.error-notification-overlay {
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}

/* 错误提示容器 */
.error-notification {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  background: white;
  border-radius: 12px;
  padding: 20px 20px 16px 20px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
  max-width: 450px;
  width: 100%;
  border-left: 4px solid;
  animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  transition: all 0.3s ease;
  pointer-events: auto;
  outline: none;
}

/* 不同类型的通知 */
.error-notification.error {
  border-left-color: #dc2626;
  background: linear-gradient(135deg, #fef2f2 0%, #fef2f2 100%);
}

.error-notification.warning {
  border-left-color: #f59e0b;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
}

.error-notification.success {
  border-left-color: #10b981;
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
}

.error-notification.info {
  border-left-color: #3b82f6;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
}

/* 通知图标 */
.error-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.error-notification.error .error-icon svg {
  color: #dc2626;
}

.error-notification.warning .error-icon svg {
  color: #f59e0b;
}

.error-notification.success .error-icon svg {
  color: #10b981;
}

.error-notification.info .error-icon svg {
  color: #3b82f6;
}

/* 通知内容 */
.error-content {
  flex: 1;
  min-width: 0;
  padding-right: 8px;
}

/* 通知标题 */
.error-title {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: #1f2937;
  line-height: 1.4;
}

.error-notification.error .error-title {
  color: #991b1b;
}

.error-notification.warning .error-title {
  color: #92400e;
}

.error-notification.success .error-title {
  color: #065f46;
}

.error-notification.info .error-title {
  color: #1e40af;
}

/* 通知消息 */
.error-message {
  font-size: 20px;
  margin: 0;
  color: #6b7280;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: pre-line;
}

/* 关闭按钮 */
.error-close {
  position: absolute;
  top: 12px;
  right: 12px;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.1);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  padding: 4px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: #6b7280;
}

.error-close:hover {
  background-color: rgba(0, 0, 0, 0.15);
  transform: scale(1.1);
}

/* 进度条容器 */
.error-progress {
  position: absolute;
  bottom: 0;
  left: 2px;
  right: 0;
  height: 4px;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 0 0 12px 12px;
  overflow: hidden;
}

/* 进度条 */
.error-progress-bar {
  height: 100%;
  width: 100%;
  transition: width 100ms linear;
  border-radius: 0 0 0 12px;
}

.error-progress-bar.error {
  background: linear-gradient(90deg, #dc2626, #ef4444);
}

.error-progress-bar.warning {
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
}

.error-progress-bar.success {
  background: linear-gradient(90deg, #10b981, #34d399);
}

.error-progress-bar.info {
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}

/* 动画效果 */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 退出动画 */
.error-notification-overlay:not(.no-animation) {
  animation: fadeIn 0.2s ease;
}

.error-notification-overlay.leaving {
  animation: fadeOut 0.2s ease forwards;
}

.error-notification.leaving {
  animation: slideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes slideOut {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
}
</style>

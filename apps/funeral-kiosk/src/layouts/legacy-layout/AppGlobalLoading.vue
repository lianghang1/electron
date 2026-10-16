<script setup lang="ts">
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
  loadingText: {
    type: String,
    default: '加载中...',
  },
  timeout: {
    type: Number,
    default: 60000,
  },
})

const emit = defineEmits(['timeout'])

const timeoutTimer = ref<number | null>(null)

function clearTimer() {
  if (timeoutTimer.value) {
    clearTimeout(timeoutTimer.value)
    timeoutTimer.value = null
  }
}

watch(() => props.isVisible, (newVal, oldVal) => {
  if (newVal === oldVal) { return }

  if (newVal) {
    clearTimer()

    timeoutTimer.value = setTimeout(() => {
      emit('timeout')
      timeoutTimer.value = null
    }, props.timeout)
  }
  else {
    clearTimer()
  }
}, { immediate: true })

onUnmounted(() => {
  clearTimer()
})
</script>

<template>
  <div v-if="isVisible" class="global-loading-overlay">
    <div class="global-loading">
      <div class="loading-spinner" />
      <div class="loading-text">
        {{ loadingText }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 全局loading遮罩层 */
.global-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* background: rgba(255, 255, 255, 0.9); */
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(3px);
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* loading容器 */
.global-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 40px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.4s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 加载动画 */
.loading-spinner {
  width: 60px;
  height: 60px;
  border: 4px solid #f0f0f0;
  border-top: 4px solid var(--v-color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  position: relative;
}

/* 中心装饰 */
.loading-spinner::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  background: var(--v-color-primary);
  border-radius: 50%;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 加载文字 */
.loading-text {
  color: #333;
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  letter-spacing: 0.5px;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .global-loading {
    padding: 30px 20px;
    margin: 0 20px;
  }

  .loading-spinner {
    width: 50px;
    height: 50px;
  }

  .loading-text {
    font-size: 16px;
  }
}
</style>

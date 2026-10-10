<script setup lang="ts">
defineProps<{
  isSecondaryPage: boolean
  pageTitle: string
  countdown: number
}>()

const emit = defineEmits(['back'])

function handleBack() {
  emit('back')
}
</script>

<template>
  <div v-if="isSecondaryPage" class="back-with-countdown fixed-nav">
    <div class="nav-left">
      <button class="back-btn" @click="handleBack">
        <span class="back-arrow i-mingcute-arrow-left-fill" />
        返回主菜单
      </button>
      <h2 class="page-subtitle">
        {{ pageTitle }}
      </h2>
    </div>
    <div class="countdown-display">
      <div class="countdown-info">
        <span class="countdown-label">无操作将自动返回</span>
      </div>
      <div class="countdown-timer">
        <div class="countdown-circle">
          <div class="countdown-inner">
            <span class="countdown-number">{{ countdown }}</span>
            <span class="countdown-unit">秒</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 返回按钮与倒计时融合样式 */
.back-with-countdown {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: white;
  padding: 12px 20px;
  margin-bottom: 15px;
  border-bottom: 2px solid rgba(0, 53, 148, 0.2);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  width: 100%;
  border-radius: 8px;
  transition: all 0.3s ease;
}

/* 固定导航样式 */
.fixed-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  margin: 0;
  border-radius: 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
}

/* 导航左侧区域 */
.nav-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 1;
  justify-content: flex-start;
}

/* 页面副标题 */
.page-subtitle {
  font-size: 18px;
  font-weight: 700;
  color: var(--v-color-primary);
  margin: 0;
  flex: 1;
  text-align: left;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(135deg, #003594 0%, #0056b3 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 24px;
  min-height: 48px;
  background: var(--v-color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 120px;
}

.back-btn:hover {
  background: #002a7a;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(0, 53, 148, 0.3);
}

.back-arrow {
  font-size: 16px;
  font-weight: bold;
}

.countdown-display {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #003594 0%, #0056b3 100%);
  color: white;
  border-radius: 8px;
  box-shadow: 0 3px 12px rgba(0, 53, 148, 0.3);
  font-size: 12px;
  transition: all 0.3s ease;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.countdown-info {
  display: flex;
  align-items: center;
  justify-content: center;
}

.countdown-label {
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.98);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  letter-spacing: 0.3px;
}

.countdown-timer {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 圆形倒计时设计 */
.countdown-circle {
  width: 45px;
  height: 45px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 100%);
  border-radius: 50%;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.2),
    inset 0 1px 3px rgba(255, 255, 255, 0.2),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}

/* 倒计时内部 */
.countdown-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  z-index: 2;
  position: relative;
}

.countdown-number {
  font-size: 18px;
  font-weight: 800;
  color: white;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  animation: pulse 1.5s ease-in-out infinite;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  line-height: 1;
}

.countdown-unit {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
  margin-top: 1px;
}

/* 倒计时数字脉冲动画 */
@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }
  50% {
    transform: scale(1.05);
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  }
}

/* 圆形倒计时背景动画 */
.countdown-circle::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: conic-gradient(
    from 0deg,
    rgba(255, 255, 255, 0.2) 0%,
    rgba(255, 255, 255, 0.05) 50%,
    rgba(255, 255, 255, 0.2) 100%
  );
  animation: rotate 2s linear infinite;
  opacity: 0.5;
}

/* 旋转动画 */
@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

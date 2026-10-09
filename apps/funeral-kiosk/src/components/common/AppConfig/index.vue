<script setup lang="ts">
import { logout } from '@/http'
import AuthTab from './components/Tabs/AuthTab.vue'
import DeviceTab from './components/Tabs/DeviceTab.vue'

const props = defineProps<{
  isVisible: boolean
}>()

const emit = defineEmits(['close', 'save', 'exit-app'])

const isAuthenticated = ref<boolean>(false)
const authPassword = ref<string>('')
const authError = ref<string>('')
const countdown = ref(30)
const activeTab = ref<string>('device')
const showExitConfirm = ref<boolean>(false)

const tabs = ref<LabelValueOption<string>[]>([
  {
    label: '设备信息',
    value: 'device',
  },
  {
    label: '授权密码',
    value: 'auth',
  },
])

const autoCloseTask = useTimeTask((next, stop) => {
  countdown.value--
  if (countdown.value <= 0) {
    stop()
    handleClose()
    return
  }
  next()
}, 1000)

function handleClose() {
  emit('close')
  activeTab.value = 'device'
}

async function handleAuth() {
  const verifyResult = await window.eApi.auth.auth(authPassword.value)
  if (!verifyResult) {
    authError.value = '授权密码错误，请重新输入'
    return
  }
  isAuthenticated.value = true
  authError.value = ''
}

function handleExitApp() {
  showExitConfirm.value = true
}

function handleCancelExitApp() {
  showExitConfirm.value = false
}

async function handleConfirmExitApp() {
  showExitConfirm.value = false
  await logout()
  window.eApi?.app.quit()
}

watch(() => props.isVisible, (val) => {
  if (val) {
    countdown.value = 30
    isAuthenticated.value = false
    authPassword.value = ''
    authError.value = ''
    autoCloseTask?.start()
  }
  else {
    autoCloseTask?.stop()
  }
}, {
  immediate: true,
})

watch(
  () => isAuthenticated.value,
  (newVal) => {
    if (newVal) {
      autoCloseTask?.stop()
    }
  },
)
</script>

<template>
  <!-- 配置界面 -->
  <div v-if="isVisible" class="config-overlay">
    <!-- 密码授权模态窗 -->
    <div v-if="!isAuthenticated" class="auth-modal">
      <div class="auth-modal-content">
        <div class="auth-header">
          <h2>配置授权</h2>
          <div v-if="countdown > 0" class="auth-countdown">
            {{ countdown }}秒后自动关闭
          </div>
        </div>
        <p class="auth-desc">
          请输入授权密码以访问配置界面
        </p>
        <div class="auth-form">
          <input v-model="authPassword" type="password" placeholder="请输入授权密码" autofocus @keyup.enter="handleAuth">
          <div class="auth-buttons">
            <button class="btn-cancel" @click="handleClose">
              取消
            </button>
            <button class="btn-auth" @click="handleAuth">
              授权
            </button>
          </div>
          <p v-if="authError" class="auth-error">
            {{ authError }}
          </p>
        </div>
      </div>
    </div>

    <!-- 确认退出模态窗 -->
    <div v-if="showExitConfirm" class="auth-modal">
      <div class="auth-modal-content exit-confirm-modal">
        <div class="auth-header">
          <h2>退出确认</h2>
        </div>
        <p class="auth-desc">
          确定要退出应用吗？
        </p>
        <div class="auth-buttons">
          <button class="btn-cancel" @click="handleCancelExitApp">
            取消
          </button>
          <button class="btn-auth" @click="handleConfirmExitApp">
            退出应用
          </button>
        </div>
      </div>
    </div>

    <!-- 配置界面主体 -->
    <div v-else-if="isAuthenticated && !showExitConfirm" class="config-container">
      <!-- 配置界面标题 -->
      <div class="config-header">
        <h2>终端机配置</h2>
        <button class="config-close" @click="handleClose">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- 配置标签页导航 -->
      <div class="config-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="tab-button" :class="[{ active: activeTab === tab.value }]"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- 配置内容区域 -->
      <div class="config-content">
        <DeviceTab v-if="activeTab === 'device'" />
        <AuthTab v-if="activeTab === 'auth'" :close="handleClose" />
      </div>

      <!-- 配置界面底部 -->
      <div class="config-footer">
        <div class="footer-left">
          <button class="btn-exit" @click="handleExitApp">
            退出应用
          </button>
        </div>
        <div class="footer-right">
          <!-- <button class="btn-reset" @click="handleResetConfig">
            重置
          </button>
          <button class="btn-save" @click="handleSaveConfig">
            保存配置
          </button> -->
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 配置界面遮罩层 */
.config-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  animation: fadeIn 0.3s ease;
}

/* 配置界面容器 */
.config-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 90vw;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease;
}

/* 授权模态窗 */
.auth-modal {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.auth-modal-content {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 20px;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    0 0 40px rgba(0, 53, 148, 0.1);
  padding: 56px;
  width: 90vw;
  max-width: 550px;
  min-height: 450px;
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(0, 53, 148, 0.1);
}

/* 科技感背景元素 */
.auth-modal-content::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background:
    radial-gradient(circle at 20% 50%, rgba(0, 53, 148, 0.05) 0%, transparent 50%),
    radial-gradient(circle at 80% 30%, rgba(0, 86, 179, 0.05) 0%, transparent 50%),
    radial-gradient(circle at 40% 80%, rgba(0, 123, 255, 0.05) 0%, transparent 50%);
  animation: backgroundMove 20s linear infinite;
  z-index: 0;
}

@keyframes backgroundMove {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  100% {
    transform: translate(-25%, -25%) rotate(360deg);
  }
}

/* 授权模态窗头部 */
.auth-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  position: relative;
  z-index: 1;
}

.auth-header h2 {
  font-size: 28px;
  font-weight: 800;
  color: #003594;
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* 授权倒计时 */
.auth-countdown {
  font-size: 14px;
  color: #003594;
  background-color: rgba(0, 53, 148, 0.1);
  border: 1px solid rgba(0, 53, 148, 0.2);
  padding: 8px 16px;
  border-radius: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  font-weight: 600;
}

.auth-desc {
  font-size: 18px;
  color: #333;
  margin: 0 0 40px 0;
  position: relative;
  z-index: 1;
  text-align: center;
}

.auth-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 28px;
  flex: 1;
  position: relative;
  z-index: 1;
}

.auth-form input {
  padding: 20px 24px;
  border: 1px solid rgba(0, 53, 148, 0.2);
  border-radius: 12px;
  font-size: 16px;
  width: 100%;
  transition: all 0.3s ease;
  background: white;
  color: #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.auth-form input::placeholder {
  color: rgba(0, 0, 0, 0.4);
}

.auth-form input:focus {
  outline: none;
  border-color: #003594;
  box-shadow:
    0 0 0 3px rgba(0, 53, 148, 0.1),
    0 2px 8px rgba(0, 53, 148, 0.2);
  background: white;
}

.auth-buttons {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-top: 24px;
  position: relative;
  z-index: 1;
}

.auth-buttons button {
  padding: 16px 32px;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 140px;
  position: relative;
  overflow: hidden;
}

/* 按钮发光效果 */
.auth-buttons button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s ease;
}

.auth-buttons button:hover::before {
  left: 100%;
}

.btn-cancel {
  background: #f8f9fa;
  color: #333;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.btn-cancel:hover {
  background: #e9ecef;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.btn-auth {
  background: linear-gradient(135deg, #003594 0%, #002a7a 100%);
  color: white;
  box-shadow: 0 4px 8px rgba(0, 53, 148, 0.2);
}

.btn-auth:hover {
  background: linear-gradient(135deg, #002a7a 0%, #003594 100%);
  box-shadow: 0 6px 12px rgba(0, 53, 148, 0.3);
  transform: translateY(-2px);
}

.auth-error {
  color: #dc3545;
  font-size: 16px;
  margin: 0;
  text-align: center;
  margin-top: 20px;
  position: relative;
  z-index: 1;
  background: rgba(220, 53, 69, 0.05);
  border: 1px solid rgba(220, 53, 69, 0.2);
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(220, 53, 69, 0.1);
}

/* 配置界面标题 */
.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  border-bottom: 1px solid #f0f0f0;
  background: linear-gradient(135deg, #003594 0%, #002a7a 100%);
  color: white;
}

.config-header h2 {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.config-close {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.config-close:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

/* 配置标签页 */
.config-tabs {
  display: flex;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  padding: 0 32px;
  flex-wrap: wrap;
}

.tab-button {
  padding: 16px 24px;
  border: none;
  background: none;
  font-size: 16px;
  font-weight: 600;
  color: #666;
  cursor: pointer;
  transition: all 0.3s ease;
  border-bottom: 3px solid transparent;
}

.tab-button:hover {
  color: #003594;
  background: rgba(0, 53, 148, 0.05);
}

.tab-button.active {
  color: #003594;
  border-bottom-color: #003594;
  background: white;
}

/* 配置内容区域 */
.config-content {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
  background: white;
  min-height: 300px;
  /* 隐藏滚动条但保留滚动功能 */
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

/* 隐藏滚动条 */
.config-content::-webkit-scrollbar {
  display: none;
}

/* 标签页内容 */
.tab-content,
:deep(.tab-content) {
  animation: fadeIn 0.3s ease;
  min-height: 400px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 配置表单 */
.config-form,
:deep(.config-form) {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 表单组 */
.form-group,
:deep(.form-group) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label,
:deep(.form-group label) {
  font-size: 14px;
  font-weight: 600;
  color: #666;
}

.form-group input,
.form-group select,
:deep(.form-group input),
:deep(.form-group select) {
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.3s ease;
}

.form-group input:focus,
.form-group select:focus,
:deep(.form-group input:focus),
:deep(.form-group select:focus) {
  outline: none;
  border-color: #003594;
  box-shadow: 0 0 0 3px rgba(0, 53, 148, 0.1);
}

/* 复选框组 */
.checkbox-group,
:deep(.checkbox-group) {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.checkbox-group input[type="checkbox"],
:deep(.checkbox-group input[type="checkbox"]) {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-group label,
:deep(.checkbox-group label) {
  cursor: pointer;
  margin: 0;
}

/* 滑块输入 */
.form-group input[type="range"],
:deep(.form-group input[type="range"]) {
  width: 100%;
  margin: 8px 0;
}

.form-group span,
:deep(.form-group span) {
  font-size: 14px;
  color: #003594;
  font-weight: 600;
  align-self: flex-end;
  margin-top: -8px;
}

/* 关于信息 */
.about-info,
:deep(.about-info) {
  font-size: 16px;
  color: #333;
  margin: 0;
  padding: 12px 16px;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

/* 测试按钮 */
.btn-test,
:deep(.btn-test) {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 120px;
  background: linear-gradient(135deg, #28a745 0%, #218838 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(40, 167, 69, 0.2);
}

.btn-test:hover,
:deep(.btn-test:hover) {
  background: linear-gradient(135deg, #218838 0%, #1e7e34 100%);
  box-shadow: 0 4px 8px rgba(40, 167, 69, 0.3);
  transform: translateY(-2px);
}

/* 检查更新按钮 */
.btn-check-update,
:deep(.btn-check-update) {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 120px;
  background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(23, 162, 184, 0.2);
}

.btn-check-update:hover,
:deep(.btn-check-update:hover) {
  background: linear-gradient(135deg, #138496 0%, #117a8b 100%);
  box-shadow: 0 4px 8px rgba(23, 162, 184, 0.3);
  transform: translateY(-2px);
}

/* 退出确认模态窗 */
.exit-confirm-modal {
  padding: 40px;
  max-width: 400px;
  min-height: 300px;
}

.exit-confirm-modal .auth-header h2 {
  font-size: 24px;
}

.exit-confirm-modal .auth-desc {
  font-size: 16px;
  margin-bottom: 30px;
}

/* 配置界面底部 */
.config-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  border-top: 1px solid #f0f0f0;
  background-color: #f8f9fa;
}

.footer-left {
  display: flex;
}

.footer-right {
  display: flex;
  gap: 16px;
}

/* 按钮样式 */
.config-footer button {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 120px;
}

.btn-exit {
  background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(244, 67, 54, 0.2);
}

.btn-exit:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);
}

.btn-reset {
  background-color: #f5f5f5;
  color: #666;
  border: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.btn-reset:hover {
  background-color: #e9e9e9;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.btn-save {
  background: linear-gradient(135deg, #003594 0%, #002a7a 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(0, 53, 148, 0.2);
}

.btn-save:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 53, 148, 0.3);
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
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .config-container {
    width: 95vw;
    max-height: 95vh;
  }

  .config-header {
    padding: 20px;
  }

  .config-header h2 {
    font-size: 20px;
  }

  .config-content {
    padding: 20px;
  }

  .config-footer {
    padding: 20px;
  }

  .config-footer button {
    padding: 10px 20px;
    font-size: 14px;
  }
}
</style>

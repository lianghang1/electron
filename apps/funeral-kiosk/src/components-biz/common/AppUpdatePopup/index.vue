<script setup lang="ts">
import type { VersionData } from '@shared/types'
import { cloneDeep } from 'lodash-es'
import { formatNumber } from '@/utils'

let speed: number = 0.52
const target: number = 92

const appStore = useAppStore()

const visible = ref<boolean>(false)
const newVersion = ref<string>('')
const checkResource = ref<VersionData>({
  hasUpdate: false,
})
const timeout = ref<number>(3)
const downloadProgress = ref<number>(0)
const checking = ref<boolean>(false)

const timeoutTask = useTimeTask((next, stop) => {
  timeout.value--
  if (timeout.value <= 0) {
    stop()
    handleUpdate()
    return
  }
  next()
}, 1000)

const progressTask = useTimeTask((next, stop) => {
  downloadProgress.value += speed

  if (downloadProgress.value >= 100) {
    stop()
    return
  }

  if (downloadProgress.value > 90) {
    speed = 0.02
  }

  if (downloadProgress.value > target - 5) {
    speed = 0.05
  }

  if (downloadProgress.value > target) {
    downloadProgress.value = target - 0.1
  }

  next()
}, 200)

const checkVersionTask = useTimeTask(async (next, stop) => {
  await handleCheckUpdate()
  await nextTick()
  if (visible.value) {
    stop()
  }
  else {
    next()
  }
}, 1000 * 60 * 2)

async function handleUpdate() {
  try {
    checking.value = true
    progressTask.start()
    const data = await window.eApi?.updater.update(cloneDeep(checkResource.value))
    // TODO
    console.log(data)
    downloadProgress.value = 100
  }
  finally {
    checking.value = false
  }
}

async function handleCheckUpdate() {
  if (checking.value) {
    return
  }
  checking.value = true
  timeout.value = 3
  downloadProgress.value = 0
  try {
    const data = await window.eApi?.updater.check(appStore.version)
    checkResource.value = (data || {}) as VersionData
    newVersion.value = checkResource.value.version || ''

    visible.value = checkResource.value.hasUpdate === true
    if (visible.value) {
      timeoutTask.start()
    }
    else {
      checking.value = false
    }
  }
  catch (error: any) {
    checking.value = false
    console.error(error)
    visible.value = false
  }
}

onMounted(() => {
  checkVersionTask?.start()
  handleCheckUpdate()
})
</script>

<template>
  <!-- 系统更新弹窗 - 始终使用模态框 -->
  <div v-if="visible" class="modal-overlay" />
  <div v-if="visible" class="custom-modal update-modal">
    <div class="modal-content">
      <!-- 蓝色标题栏 -->
      <div class="software-update-header">
        <div class="header-left">
          <!-- <icon-refresh class="header-icon" /> -->
          <h2 class="header-title">
            软件更新
          </h2>
        </div>
        <!-- <button class="modal-close">
          ×
        </button> -->
      </div>

      <div class="modal-body">
        <div class="update-content">
          <!-- 发现新版本 -->
          <div class="version-discovery">
            <h3 class="discovery-title">
              发现新版本
            </h3>
            <p class="discovery-desc">
              检测到新版本软件可用，建议立即更新以获得更好的使用体验。
            </p>
          </div>

          <!-- 版本对比 -->
          <div class="version-comparison">
            <span class="current-version">当前版本: <strong>{{ appStore.version }}</strong></span>
            <span class="new-version">新版本: <strong class="version-number">{{ newVersion }}</strong></span>
          </div>

          <!-- 更新内容 -->
          <div class="update-changelog-section">
            <h4 class="changelog-section-title">
              更新内容:
            </h4>
            <div class="changelog-content">
              <div v-if="checkResource.description" class="changelog-list">
                <div class="changelog-item" v-html="checkResource.description" />
              </div>
              <p v-else class="no-changelog">
                暂无更新内容
              </p>
            </div>
          </div>

          <!-- 下载进度 -->
          <div class="download-progress-section">
            <div class="progress-header">
              <span class="progress-title">下载进度:</span>
              <span class="progress-percentage">{{ downloadProgress > 100 ? 100 : formatNumber(downloadProgress) }}%</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar" :style="{ width: `${downloadProgress}%` }" />
            </div>
          </div>

          <!-- 注意事项 -->
          <div class="update-notice">
            <span class="notice-icon">⚠️</span>
            <p class="notice-text">
              <template v-if="timeout > 0">
                预计
                <span class="text-22px">{{ timeout }}s</span>
                后自动开始更新，请耐心等待。
              </template>
              更新过程中请不要关闭设备电源，预计需要3-5分钟
            </p>
          </div>
        </div>
      </div>

      <!-- 按钮区域 -->
      <div class="modal-footer">
        <!-- <button class="btn btn-remind-later" @click="handleCancel">
          稍后提醒
        </button> -->
        <!-- <button class="btn btn-update-now" @click="handleOk">
          <span class="update-icon">⬇️</span>
          立即更新
        </button> -->
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(5px);
  z-index: 999;
  animation: fadeIn 0.3s ease;
}

.custom-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  animation: slideIn 0.3s ease;
}

.modal-content {
  background: white;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  max-width: 600px;
  width: 90vw;
}

.modal-body {
  padding: 35px;
}

.modal-footer {
  padding: 20px 35px 30px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
  gap: 15px;
}

/* 按钮样式 */
.btn {
  padding: 14px 28px;
  min-height: 48px;
  min-width: 120px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  outline: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* 软件更新弹窗样式 */
.software-update-header {
  background: linear-gradient(135deg, #003594 0%, #002a7a 100%);
  color: white;
  padding: 20px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 增大关闭按钮点击区域 */
.modal-close {
  width: 48px;
  height: 48px;
  font-size: 32px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-size: 24px;
  margin-right: 10px;
}

.header-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: white;
}

.software-update-header .modal-close {
  color: white;
}

.software-update-header .modal-close:hover {
  background-color: rgba(255, 255, 255, 0.15);
}

.update-content {
  padding: 20px 0;
}

.version-discovery {
  margin-bottom: 25px;
}

.discovery-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
}

.discovery-desc {
  color: #666;
  font-size: 14px;
  line-height: 1.5;
}

.version-comparison {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 8px;
}

.current-version, .new-version {
  font-size: 14px;
  color: #666;
}

.version-number {
  color:var(--v-color-primary);
  font-size: 16px;
}

.update-changelog-section {
  margin-bottom: 25px;
}

.changelog-section-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 15px;
}

.changelog-list {
  list-style: none;
  padding: 0;
  margin: 0;
  background-color: #f8f9fa;
  border-radius: 8px;
  overflow: hidden;
}

.changelog-item {
  padding: 12px 15px;
  border-bottom: 1px solid #e9ecef;
  color: #666;
  font-size: 14px;
  line-height: 1.5;
}

.changelog-item:last-child {
  border-bottom: none;
}

.no-changelog {
  color: #999;
  font-size: 14px;
  background-color: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  text-align: center;
}

.download-progress-section {
  margin-bottom: 25px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.progress-title {
  font-size: 14px;
  color: #666;
  font-weight: 600;
}

.progress-percentage {
  font-size: 16px;
  font-weight: 600;
  color:var(--v-color-primary);
}

.progress-bar-container {
  height: 8px;
  background-color: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #003594 0%, #0056b3 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.update-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px;
  background-color: #fff3cd;
  border: 1px solid #ffeeba;
  border-radius: 8px;
  color: #856404;
  font-size: 16px;
}

.notice-icon {
  font-size: 18px;
}

.update-modal .btn-remind-later {
  background-color: #f5f5f5;
  color: #666;
  border: 1px solid #e0e0e0;
}

.update-modal .btn-update-now {
  background: linear-gradient(135deg, #003594 0%, #002a7a 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(0, 53, 148, 0.3);
}

.modal-close {
  background: none;
  border: none;
  font-size: 32px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.modal-close:hover {
  background-color: #f5f5f5;
  color: #666;
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
    transform: translate(-50%, -60%) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
</style>

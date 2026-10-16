<script setup lang="ts">
import type { CaptureDialogSession } from '@desktop/shared'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CaptureStage from './CaptureStage.vue'
import { useCaptureSession } from './use-capture-session'

const props = defineProps<{ session: CaptureDialogSession }>()
const emit = defineEmits<{ close: [] }>()

const TRANSPORT_LABEL: Record<string, string> = {
  ws: '高拍仪',
  dll: 'SDK 直连',
  service: '服务接入',
  wia: '扫描仪',
}

const stageRef = ref<InstanceType<typeof CaptureStage> | null>(null)
const {
  devices,
  cameras,
  deviceId,
  resolutions,
  resolution,
  live,
  frameSrc,
  stream,
  rotate,
  mirror,
  capturing,
  results,
  maxCount,
  full,
  canConfirm,
  confirming,
  error,
  refreshDevices,
  changeDevice,
  toggleLive,
  changeResolution,
  shoot,
  removeResult,
  confirm,
  rotateOnce,
  toggleMirror,
  clearError,
} = useCaptureSession(props.session, () => stageRef.value?.videoEl ?? null)

/** 设备下拉双分组：高拍仪/采集设备（业务库） + 本机摄像头（getUserMedia） */
const deviceGroups = computed(() => [
  {
    label: '高拍仪 / 采集设备',
    items: devices.value.map(d => ({
      value: d.id,
      label: `${d.displayName}（${TRANSPORT_LABEL[d.transport] ?? d.transport}${d.status === 'ready' ? '' : ' · 不可用'}）`,
    })),
  },
  {
    label: '本机摄像头',
    items: cameras.value.map((c, i) => ({ value: `uvc:${c.deviceId}`, label: c.label || `摄像头 ${i + 1}` })),
  },
])

const hasDevices = computed(() => deviceGroups.value.some(g => g.items.length > 0))
/** 缩略条数据：保留原始下标供删除；无缩略图的结果不占位 */
const thumbs = computed(() => results.value
  .map((result, index) => ({ result, index }))
  .filter(item => item.result.thumbDataUrl))
/** 拍摄计数（n/max），maxCount=1 时仅显示已拍标记 */
const countLabel = computed(() => `${results.value.length}/${maxCount.value}`)
const previewLabel = computed(() => (live.value ? '预览中' : '未开启'))
/** 完成按钮文案：带张数，回传中显示进行时 */
const confirmLabel = computed(() => (confirming.value ? '回传中…' : results.value.length ? `完成（${results.value.length}）` : '完成'))

function onClose(): void {
  emit('close')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    onClose()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await refreshDevices()
  // 打开浮层即出画面：已预选设备（会话指定或自动选中）时自动开预览，省一次点击
  if (deviceId.value) { await toggleLive() }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="cu-dialog">
    <header class="cu-dialog__head">
      <div class="cu-dialog__head-text">
        <div class="cu-dialog__title-row">
          <h3 class="cu-dialog__title">
            {{ session.title }}
          </h3>
          <span v-if="maxCount > 1" class="cu-dialog__count">{{ countLabel }}</span>
        </div>
        <p class="cu-dialog__sub">
          来自 {{ session.appName }} · 完成后结果回传页面
        </p>
      </div>
      <button class="cu-dialog__close" title="取消拍摄" @click="onClose">
        ×
      </button>
    </header>

    <!-- 左预览 + 右控制栏：操作动线自上而下（选设备 → 分辨率 → 预览 → 拍摄） -->
    <div class="cu-dialog__body">
      <div class="cu-dialog__stage">
        <CaptureStage ref="stageRef" :stream="stream" :frame-src="frameSrc" :rotate="rotate" :mirror="mirror" />
        <span class="cu-dialog__chip" :class="{ 'cu-dialog__chip--live': live }">
          <i class="cu-dialog__chip-dot" />{{ previewLabel }}
        </span>
        <!-- 快门反馈：拍摄瞬间白闪一帧 -->
        <div v-if="capturing" class="cu-dialog__flash" />
        <!-- 浮动错误提示：覆盖在预览区顶部，不挤占布局，4s 自动消失 -->
        <div v-if="error" class="cu-dialog__toast">
          <span class="cu-dialog__toast-text">{{ error }}</span>
          <button class="cu-dialog__toast-close" title="忽略" @click="clearError">
            ×
          </button>
        </div>
      </div>

      <aside class="cu-dialog__panel">
        <label class="cu-dialog__field">
          <span class="cu-dialog__label">设备</span>
          <select class="cu-dialog__select" :value="deviceId" @change="changeDevice">
            <option v-if="!hasDevices" value="">
              未检测到设备
            </option>
            <template v-else>
              <optgroup v-for="group in deviceGroups" :key="group.label" :label="group.label">
                <option v-for="item in group.items" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </optgroup>
            </template>
          </select>
        </label>
        <label v-if="resolutions.length" class="cu-dialog__field">
          <span class="cu-dialog__label">分辨率</span>
          <select class="cu-dialog__select" :value="resolution" @change="changeResolution">
            <option v-for="r in resolutions" :key="r.value" :value="r.value">
              {{ r.label }}
            </option>
          </select>
        </label>
        <button class="cu-btn" @click="toggleLive">
          {{ live ? '停止预览' : '开启预览' }}
        </button>
        <div class="cu-dialog__fx">
          <button class="cu-btn" @click="rotateOnce">
            旋转
          </button>
          <button class="cu-btn" :class="{ 'cu-btn--on': mirror }" @click="toggleMirror">
            镜像
          </button>
        </div>
        <button class="cu-btn cu-btn--primary cu-btn--shoot" :disabled="capturing || full" @click="shoot">
          {{ capturing ? '拍摄中…' : full ? '已拍满' : '拍摄' }}
        </button>
        <span class="cu-dialog__panel-hint">
          {{ maxCount > 1 ? `可拍 ${maxCount} 张，拍完点击右下角「完成」` : '拍好后点击右下角「完成」' }}
        </span>
      </aside>
    </div>

    <div class="cu-dialog__thumbs">
      <template v-if="thumbs.length">
        <figure v-for="item in thumbs" :key="item.index" class="cu-dialog__thumb">
          <img :src="item.result.thumbDataUrl" :title="item.result.imagePath" alt="拍摄记录">
          <button class="cu-dialog__thumb-del" title="删除" @click="removeResult(item.index)">
            ×
          </button>
        </figure>
      </template>
      <span v-else class="cu-dialog__thumbs-empty">拍摄结果将显示在这里，完成后可删除重拍</span>
    </div>

    <footer class="cu-dialog__foot">
      <button class="cu-btn cu-btn--lg" @click="onClose">
        取消
      </button>
      <button class="cu-btn cu-btn--primary cu-btn--lg" :disabled="!canConfirm || confirming" @click="confirm">
        {{ confirmLabel }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.cu-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: system-ui, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  user-select: none;
}

/* ---- 头部 ---- */
.cu-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.cu-dialog__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cu-dialog__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2328;
}

.cu-dialog__count {
  padding: 1px 8px;
  border-radius: 999px;
  background: #ccfbf1;
  color: #0f766e;
  font-size: 11.5px;
  font-weight: 600;
}

.cu-dialog__sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #8a919c;
}

.cu-dialog__close {
  border: none;
  background: transparent;
  width: 26px;
  height: 26px;
  padding: 0;
  font-size: 17px;
  line-height: 26px;
  color: #8a919c;
  cursor: pointer;
  border-radius: 7px;
  flex-shrink: 0;
  transition: background-color 0.12s, color 0.12s;
}

.cu-dialog__close:hover {
  color: #1f2328;
  background: #f3f6f9;
}

/* ---- 浮动错误提示（覆盖预览区顶部，不占布局，4s 自动消失） ---- */
.cu-dialog__toast {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 20px);
  padding: 7px 12px;
  border-radius: 8px;
  background: rgba(190, 18, 60, 0.92);
  color: #fff;
  font-size: 12px;
  box-shadow: 0 8px 24px rgba(2, 8, 20, 0.28);
  animation: cu-toast-in 0.16s ease-out;
  backdrop-filter: blur(4px);
  pointer-events: auto;
}

.cu-dialog__toast-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cu-dialog__toast-close {
  border: none;
  background: transparent;
  padding: 0;
  width: 16px;
  height: 16px;
  line-height: 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  flex-shrink: 0;
}

.cu-dialog__toast-close:hover {
  color: #fff;
}

@keyframes cu-toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-6px);
  }

  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* ---- 快门闪光 ---- */
.cu-dialog__flash {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: #fff;
  pointer-events: none;
  animation: cu-flash 0.3s ease-out forwards;
}

@keyframes cu-flash {
  from {
    opacity: 0.55;
  }

  to {
    opacity: 0;
  }
}

/* ---- 左预览 + 右控制栏 ---- */
.cu-dialog__body {
  display: flex;
  gap: 14px;
  align-items: stretch;
}

.cu-dialog__stage {
  position: relative;
  flex: 1;
  min-width: 0;
}

.cu-dialog__chip {
  position: absolute;
  top: 10px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(13, 17, 23, 0.72);
  color: #c9d1d9;
  font-size: 11px;
  pointer-events: none;
  backdrop-filter: blur(4px);
}

.cu-dialog__chip--live {
  color: #7ee2b8;
}

.cu-dialog__chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6b7688;
}

.cu-dialog__chip--live .cu-dialog__chip-dot {
  background: #22c55e;
}

/* ---- 控制栏 ---- */
.cu-dialog__panel {
  width: 232px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cu-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cu-dialog__label {
  font-size: 11px;
  color: #8a919c;
}

.cu-dialog__select {
  width: 100%;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  transition: border-color 0.12s;
}

.cu-dialog__select:hover,
.cu-dialog__select:focus {
  border-color: #0f766e;
  outline: none;
}

.cu-dialog__fx {
  display: flex;
  gap: 8px;
}

.cu-dialog__fx .cu-btn {
  flex: 1;
}

.cu-dialog__panel-hint {
  font-size: 11px;
  line-height: 1.5;
  color: #8a919c;
}

/* ---- 按钮 ---- */
.cu-btn {
  border: 1px solid #d5dae1;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 12px;
  font-family: inherit;
  color: #1f2328;
  background: #fff;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.12s, border-color 0.12s, color 0.12s, opacity 0.12s;
}

.cu-btn:hover:not(:disabled):not(.cu-btn--primary):not(.cu-btn--on) {
  border-color: #b8c0cb;
  background: #f3f6f9;
}

.cu-btn--primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #fff;
}

.cu-btn--primary:hover:not(:disabled) {
  border-color: #0d6a63;
  background: #0d6a63;
}

.cu-btn--shoot {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
}

.cu-btn--lg {
  padding: 8px 24px;
  font-size: 13px;
}

.cu-btn--on,
.cu-btn--on:hover:not(:disabled) {
  border-color: transparent;
  background: #ccfbf1;
  color: #0f766e;
}

.cu-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* ---- 已拍缩略条 ---- */
.cu-dialog__thumbs {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 86px;
  padding: 6px;
  border: 1px dashed #e0e5ec;
  border-radius: 10px;
  overflow-x: auto;
}

.cu-dialog__thumbs-empty {
  width: 100%;
  text-align: center;
  font-size: 11.5px;
  color: #a5adb8;
}

.cu-dialog__thumb {
  position: relative;
  margin: 0;
  flex-shrink: 0;
  animation: cu-thumb-in 0.18s ease-out;
}

@keyframes cu-thumb-in {
  from {
    opacity: 0;
    transform: scale(0.88);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.cu-dialog__thumb img {
  display: block;
  height: 72px;
  border: 1px solid #e6eaf0;
  border-radius: 8px;
  background: #10141c;
}

.cu-dialog__thumb-del {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  transition: background-color 0.12s;
}

.cu-dialog__thumb-del:hover {
  background: #dc2626;
}

/* ---- 底部 ---- */
.cu-dialog__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>

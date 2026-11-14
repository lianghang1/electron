<script setup lang="ts">
import type { CaptureDialogSession } from '@shell/shared'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CaptureStage from './CaptureStage.vue'
import CaptureThumbStrip from './CaptureThumbStrip.vue'
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
  loadingDevices,
  switching,
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

/** 设备下拉双分组：高拍仪/采集设备（业务库） + 本机摄像头（getUserMedia），空组不展示 */
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
].filter(group => group.items.length > 0))

const hasDevices = computed(() => deviceGroups.value.length > 0)
/** 分辨率「默认档」在会话内是 ''，原生 select 不允许空 option value，经哨兵值过边界 */
const RESOLUTION_DEFAULT = 'default'
const resolutionModelValue = computed(() => resolution.value === '' ? RESOLUTION_DEFAULT : resolution.value)
const resolutionOptions = computed(() => resolutions.value
  .map(r => ({ value: r.value === '' ? RESOLUTION_DEFAULT : r.value, label: r.label })))
/** 缩略条数据：保留原始下标供删除；无缩略图的结果不在缩略条显示 */
const thumbs = computed(() => results.value
  .map((result, index) => ({ result, index }))
  .filter(item => item.result.thumbDataUrl))
/** 拍摄计数（n/max），maxCount=1 时仅显示已拍标记 */
const countLabel = computed(() => `${results.value.length}/${maxCount.value}`)
const previewLabel = computed(() => (live.value ? '预览中' : '未开启'))
/** 完成按钮文案：带张数，回传中显示进行时 */
const confirmLabel = computed(() => (confirming.value ? '回传中…' : results.value.length ? `完成（${results.value.length}）` : '完成'))

// ---- 放大查看（点击缩略条在预览区查看该张，再点/继续操作恢复实时预览） ----

const viewingIndex = ref<number | null>(null)
const viewingSrc = computed(() => {
  if (viewingIndex.value === null) { return '' }
  return results.value[viewingIndex.value]?.thumbDataUrl ?? ''
})
const viewing = computed(() => viewingIndex.value !== null && !!viewingSrc.value)

/** 预览区空态：枚举中 → 检测中；无设备 → 引导配置 */
const stageEmptyText = computed(() => {
  if (loadingDevices.value) { return '正在检测设备…' }
  if (!hasDevices.value) { return '未检测到采集设备，请检查连接或在设备管理中添加' }
  return ''
})

function onView(index: number): void {
  viewingIndex.value = viewingIndex.value === index ? null : index
}

function onRemove(index: number): void {
  exitViewing()
  removeResult(index)
}

/** 拍摄/切设备/开预览前退出查看态：UVC 抽帧依赖实时 video 元素 */
function exitViewing(): void {
  viewingIndex.value = null
}

// ---- 动作包装：统一收敛查看态退出 ----

async function onChangeDevice(value: string): Promise<void> {
  exitViewing()
  await changeDevice(value)
}

async function onResolutionChange(value: string): Promise<void> {
  exitViewing()
  await changeResolution(value === RESOLUTION_DEFAULT ? '' : value)
}

async function onToggleLive(): Promise<void> {
  exitViewing()
  await toggleLive()
}

async function onShoot(): Promise<void> {
  exitViewing()
  await shoot()
}

function onClose(): void {
  emit('close')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    onClose()
    return
  }
  // 空格拍照：输入控件与展开的下拉内不拦截；preventDefault 防止焦点按钮被空格二次触发
  if (e.key !== ' ') { return }
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [role="listbox"], [role="option"]')) { return }
  e.preventDefault()
  if (!capturing.value && !full.value) {
    void onShoot()
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
          <span v-else-if="results.length" class="cu-dialog__count">已拍</span>
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
        <CaptureStage
          ref="stageRef"
          :stream="viewing ? null : stream"
          :frame-src="viewing ? viewingSrc : frameSrc"
          :rotate="viewing ? 0 : rotate"
          :mirror="viewing ? false : mirror"
          :empty-text="stageEmptyText"
        />
        <span class="cu-dialog__chip" :class="{ 'cu-dialog__chip--live': live && !viewing }">
          <i class="cu-dialog__chip-dot" />{{ viewing ? '查看记录' : previewLabel }}
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
          <select
            class="cu-dialog__select"
            :disabled="!hasDevices"
            :value="deviceId"
            @change="onChangeDevice(($event.target as HTMLSelectElement).value)"
          >
            <option v-if="!hasDevices" value="">
              {{ loadingDevices ? '正在检测设备…' : '未检测到设备' }}
            </option>
            <optgroup
              v-for="group in deviceGroups"
              :key="group.label"
              :label="group.label"
            >
              <option v-for="item in group.items" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </optgroup>
          </select>
        </label>
        <label v-if="resolutions.length" class="cu-dialog__field">
          <span class="cu-dialog__label">分辨率<template v-if="switching">（切换中…）</template></span>
          <select
            class="cu-dialog__select"
            :disabled="switching"
            :value="resolutionModelValue"
            @change="onResolutionChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="item in resolutionOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>
        <button class="cu-dialog__btn" @click="onToggleLive">
          {{ live ? '停止预览' : '开启预览' }}
        </button>
        <div class="cu-dialog__fx">
          <button class="cu-dialog__btn" :disabled="viewing" title="旋转实时画面" @click="rotateOnce">
            旋转
          </button>
          <button
            class="cu-dialog__btn"
            :class="{ 'cu-dialog__btn--active': mirror && !viewing }"
            :disabled="viewing"
            title="镜像实时画面"
            @click="toggleMirror"
          >
            镜像
          </button>
        </div>
        <button
          class="cu-dialog__btn cu-dialog__btn--primary"
          :disabled="capturing || full"
          @click="onShoot"
        >
          {{ capturing ? '拍摄中…' : full ? '已拍满' : '拍摄' }}
        </button>
        <span class="cu-dialog__panel-hint">
          {{ maxCount > 1 ? `可拍 ${maxCount} 张，拍完点击右下角「完成」` : '拍好后点击右下角「完成」' }}
        </span>
      </aside>
    </div>

    <CaptureThumbStrip :items="thumbs" :active-index="viewingIndex" @view="onView" @remove="onRemove" />

    <footer class="cu-dialog__foot">
      <button class="cu-dialog__btn" @click="onClose">
        取消
      </button>
      <button class="cu-dialog__btn cu-dialog__btn--primary" :disabled="!canConfirm || confirming" @click="confirm">
        {{ confirmLabel }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
/* 颜色全部走语义层变量（tokens 随浮层页加载）：与权限/应用中心等浮层卡同一配色体系，
   禁止出现组件自带的品牌色——主色由 flavor 注入，浮层间保持一致 */
.cu-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 760px;
  padding: 18px;
  border-radius: 14px;
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: 0 18px 60px rgba(2, 8, 20, 0.35);
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
  color: var(--foreground);
}

.cu-dialog__count {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-foreground);
  font-size: 11.5px;
  font-weight: 600;
}

.cu-dialog__sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

.cu-dialog__close {
  border: none;
  background: transparent;
  width: 26px;
  height: 26px;
  padding: 0;
  font-size: 17px;
  line-height: 26px;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: 7px;
  flex-shrink: 0;
  transition: background-color 0.12s, color 0.12s;
}

.cu-dialog__close:hover {
  color: var(--foreground);
  background: var(--muted);
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
  background: var(--destructive);
  color: var(--destructive-foreground);
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
  color: var(--muted-foreground);
}

.cu-dialog__select {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--input);
  border-radius: 8px;
  background: var(--popover);
  font-size: 12.5px;
  color: var(--foreground);
}

.cu-dialog__select:disabled {
  color: var(--muted-foreground);
  background: var(--muted);
}

.cu-dialog__btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--input);
  border-radius: 8px;
  background: var(--popover);
  font-size: 12.5px;
  color: var(--foreground);
  cursor: pointer;
  transition: background-color 0.12s, border-color 0.12s;
}

.cu-dialog__btn:hover:not(:disabled) {
  background: var(--muted);
}

.cu-dialog__btn:disabled {
  color: var(--muted-foreground);
  background: var(--muted);
  cursor: not-allowed;
}

.cu-dialog__btn--active {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--accent);
}

.cu-dialog__btn--primary {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}

.cu-dialog__btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary) 88%, #000);
}

.cu-dialog__fx {
  display: flex;
  gap: 8px;
}

.cu-dialog__fx button {
  flex: 1;
}

.cu-dialog__panel-hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

/* ---- 底部 ---- */
.cu-dialog__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>

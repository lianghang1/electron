<script setup lang="ts">
import type { CaptureDialogSession } from '@shell/shared'
import { Alert, AlertDescription } from '@ui/components/alert'
import { Badge } from '@ui/components/badge'
import { Button } from '@ui/components/button'
import { Label } from '@ui/components/label'
import { NativeSelect } from '@ui/components/native-select'
import { X } from '@ui/lib/lucide'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useCaptureSession } from '../../composables/use-capture-session'
import CaptureStage from './Stage.vue'
import CaptureThumbStrip from './ThumbStrip.vue'

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

async function onChangeDevice(event: Event): Promise<void> {
  exitViewing()
  await changeDevice((event.target as HTMLSelectElement).value)
}

async function onResolutionChange(event: Event): Promise<void> {
  exitViewing()
  const value = (event.target as HTMLSelectElement).value
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
  <!-- dialog 表面面板本体：遮罩/居中/外点关闭由 SurfaceOutlet 容器配对 -->
  <div class="flex h-[644px] max-h-full w-[824px] max-w-full flex-col gap-4 overflow-hidden rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-lg">
    <header class="flex items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-base leading-none font-semibold">
            {{ session.title }}
          </h2>
          <Badge v-if="maxCount > 1" variant="secondary">
            {{ countLabel }}
          </Badge>
          <Badge v-else-if="results.length" variant="secondary">
            已拍
          </Badge>
        </div>
        <p class="mt-1.5 text-xs text-muted-foreground">
          来自 {{ session.appName }} · 完成后结果回传页面
        </p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="取消拍摄" @click="onClose">
        <X />
      </Button>
    </header>

    <!-- 左预览 + 右控制栏：操作动线自上而下（选设备 → 分辨率 → 预览 → 拍摄） -->
    <div class="flex min-h-0 flex-1 items-stretch gap-3.5">
      <div class="relative min-w-0 flex-1">
        <CaptureStage
          ref="stageRef"
          :stream="viewing ? null : stream"
          :frame-src="viewing ? viewingSrc : frameSrc"
          :rotate="viewing ? 0 : rotate"
          :mirror="viewing ? false : mirror"
          :empty-text="stageEmptyText"
        />
        <span class="pointer-events-none absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-0.5 text-xs text-zinc-200 backdrop-blur-sm">
          <i class="size-1.5 rounded-full" :class="live && !viewing ? 'bg-emerald-400' : 'bg-zinc-500'" />{{ viewing ? '查看记录' : previewLabel }}
        </span>
        <!-- 快门反馈：拍摄瞬间白闪一帧 -->
        <div v-if="capturing" class="cu-flash" />
        <!-- 浮动错误提示：覆盖在预览区顶部，不挤占布局，4s 自动消失 -->
        <Alert
          v-if="error"
          variant="destructive"
          class="absolute top-2.5 left-1/2 z-20 w-max max-w-[calc(100%-20px)] -translate-x-1/2 py-2 shadow-lg backdrop-blur-sm"
        >
          <AlertDescription class="flex items-center gap-2 text-xs">
            <span class="min-w-0 truncate">{{ error }}</span>
            <Button variant="ghost" size="icon-xs" class="size-4 shrink-0 text-current hover:bg-transparent" aria-label="忽略" @click="clearError">
              <X class="!size-3" />
            </Button>
          </AlertDescription>
        </Alert>
      </div>

      <aside class="flex w-56 flex-none flex-col gap-2.5">
        <div class="space-y-1.5">
          <Label class="text-xs text-muted-foreground">设备</Label>
          <NativeSelect
            class="w-full text-xs"
            :disabled="!hasDevices"
            :model-value="deviceId"
            @change="onChangeDevice"
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
          </NativeSelect>
        </div>
        <div v-if="resolutions.length" class="space-y-1.5">
          <Label class="text-xs text-muted-foreground">分辨率<template v-if="switching">（切换中…）</template></Label>
          <NativeSelect
            class="w-full text-xs"
            :disabled="switching"
            :model-value="resolutionModelValue"
            @change="onResolutionChange"
          >
            <option v-for="item in resolutionOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </NativeSelect>
        </div>
        <Button variant="outline" @click="onToggleLive">
          {{ live ? '停止预览' : '开启预览' }}
        </Button>
        <div class="flex gap-2">
          <Button variant="outline" class="flex-1" :disabled="viewing" title="旋转实时画面" @click="rotateOnce">
            旋转
          </Button>
          <Button
            class="flex-1"
            :variant="mirror && !viewing ? 'default' : 'outline'"
            :disabled="viewing"
            title="镜像实时画面"
            @click="toggleMirror"
          >
            镜像
          </Button>
        </div>
        <Button :disabled="capturing || full" @click="onShoot">
          {{ capturing ? '拍摄中…' : full ? '已拍满' : '拍摄' }}
        </Button>
        <p class="text-xs leading-relaxed text-muted-foreground">
          {{ maxCount > 1 ? `可拍 ${maxCount} 张，拍完点击右下角「完成」` : '拍好后点击右下角「完成」' }}
        </p>
      </aside>
    </div>

    <CaptureThumbStrip :items="thumbs" :active-index="viewingIndex" @view="onView" @remove="onRemove" />

    <footer class="flex items-center justify-end gap-2.5">
      <Button variant="outline" @click="onClose">
        取消
      </Button>
      <Button :disabled="!canConfirm || confirming" @click="confirm">
        {{ confirmLabel }}
      </Button>
    </footer>
  </div>
</template>

<style scoped>
/* 快门闪光：拍摄瞬间的物理反馈动画（非样式体系范畴） */
.cu-flash {
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
</style>

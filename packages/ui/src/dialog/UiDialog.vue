<script setup lang="ts">
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed } from 'vue'

/**
 * 通用弹窗（reka-ui Dialog 原语统一封装）：遮罩 + 居中卡片 + 标题栏 chrome + 底部操作区。
 * 浮层窗为挂载式开关（v-if 挂载即开），关闭意图统一收敛为 close 事件，由使用方决定响应；
 * ESC / 遮罩点击 / 关闭钮 / reka 内部关闭路径全部走该事件。内容滚动交给内容层（UiScrollArea）。
 * 卡片固定浅色高对比配色（浮层窗与 Shell 不同 partition，主题态不可达）。
 */
const props = withDefaults(defineProps<{
  /** 弹窗标题；省略 = 无标题栏 chrome（内容自带头部时），无障碍由 sr-only 标题兜底 */
  title?: string
  subtitle?: string
  /** 卡片宽度（number = px） */
  width?: number | string
  /** 卡片高度（number = px）；省略 = 内容自适应 */
  height?: number | string
  /** 卡片内容留白（number = px）；省略 = 内容贴边自控 */
  padding?: number | string
  /** 标题栏关闭钮 */
  closable?: boolean
  /** 点击遮罩关闭 */
  maskClosable?: boolean
  /** ESC 关闭 */
  escClosable?: boolean
}>(), {
  width: 420,
  closable: true,
  maskClosable: true,
  escClosable: true,
})

const emit = defineEmits<{ close: [] }>()

const cardStyle = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  height: props.height == null ? undefined : typeof props.height === 'number' ? `${props.height}px` : props.height,
  padding: props.padding == null ? undefined : typeof props.padding === 'number' ? `${props.padding}px` : props.padding,
}))

function onEscape(event: KeyboardEvent): void {
  event.preventDefault()
  if (props.escClosable) {
    emit('close')
  }
}

function onOutside(event: Event): void {
  event.preventDefault()
  if (props.maskClosable) {
    emit('close')
  }
}

/** reka 内部关闭路径（如焦点异常回落）兜底收敛为 close */
function onOpenChange(value: boolean): void {
  if (!value) {
    emit('close')
  }
}
</script>

<template>
  <DialogRoot :open="true" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="ud-mask" />
      <DialogContent
        class="ud-stage"
        @escape-key-down="onEscape"
        @pointer-down-outside="onOutside"
        @interact-outside.prevent
        @open-auto-focus.prevent
      >
        <div class="ud-card" :style="cardStyle">
          <DialogTitle v-if="!title" class="ud-sr-title">
            对话框
          </DialogTitle>
          <header v-if="title" class="ud-head">
            <div class="ud-headings">
              <DialogTitle class="ud-title">
                {{ title }}
              </DialogTitle>
              <p v-if="subtitle" class="ud-sub">
                {{ subtitle }}
              </p>
            </div>
            <button v-if="closable" class="ud-close" title="关闭" @click="emit('close')">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <path d="m4 4 8 8m0-8-8 8" />
              </svg>
            </button>
          </header>

          <div class="ud-body">
            <slot />
          </div>

          <footer v-if="$slots.footer || $slots.feedback" class="ud-foot">
            <div class="ud-feedback">
              <slot name="feedback" />
            </div>
            <div class="ud-actions">
              <slot name="footer" />
            </div>
          </footer>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.ud-mask {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: rgba(15, 23, 42, 0.55);
}

.ud-stage {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 进场动画由 reka data-state 驱动、样式自包含（不借 OverlayApp 全局动画类，宿主直接嵌入也有动画） */
.ud-mask[data-state='open'] {
  animation: ud-fade 0.32s ease-out;
}

.ud-stage[data-state='open'] .ud-card {
  animation: ud-pop 0.24s ease-out;
}

@keyframes ud-fade {
  from {
    opacity: 0;
  }
}

@keyframes ud-pop {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
}

.ud-card {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  max-width: 94vw;
  max-height: 94vh;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 12px rgb(2 8 20 / 10%), 0 24px 56px rgb(2 8 20 / 24%);
  overflow: hidden;
  font-family: system-ui, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  user-select: none;
}

.ud-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  height: 52px;
  padding: 0 20px;
  border-bottom: 1px solid #eef1f5;
}

.ud-headings {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.ud-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #1f2328;
  flex-shrink: 0;
}

.ud-sub {
  margin: 0;
  font-size: 11.5px;
  line-height: 16px;
  color: #8a919c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ud-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #8a919c;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.12s, color 0.12s;
}

.ud-close:hover {
  color: #1f2328;
  background: #f3f6f9;
}

.ud-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ud-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  height: 56px;
  padding: 0 20px;
  border-top: 1px solid #eef1f5;
}

.ud-feedback {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ud-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
</style>

<style>
/* 无标题兜底（aria 合规）：sr-only 不占布局 */
.ud-sr-title {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0 0 0 0);
  overflow: hidden;
  white-space: nowrap;
}
</style>

<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { ref, watch } from 'vue'
import FhKeyboard from './FhKeyboard.vue'

/**
 * 发票抬头编辑弹层（触屏）：reka-ui Dialog 提供弹层行为原语（遮罩 / 焦点 /
 * 关闭语义），样式遵循 fh 设计体系；正文为「抬头显示行 + 中文软键盘」。
 */
const props = defineProps<{
  /** 打开时回填的抬头初值 */
  initTitle: string
}>()

const emit = defineEmits<{ confirm: [title: string] }>()

const open = defineModel<boolean>('open', { default: false })

const title = ref('')

watch(open, (value) => {
  if (value)
    title.value = props.initTitle
})

function handleInput(char: string): void {
  if (title.value.length < 30)
    title.value += char
}

function handleBackspace(): void {
  title.value = title.value.slice(0, -1)
}

function handleClear(): void {
  title.value = ''
}

function handleConfirm(): void {
  emit('confirm', title.value.trim())
  open.value = false
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fh-inv-overlay" />
      <DialogContent class="fh-inv" :aria-describedby="undefined">
        <DialogTitle class="fh-inv__title">
          发票抬头
        </DialogTitle>
        <DialogDescription class="fh-inv__desc">
          按拼音键入抬头，点击候选字上屏
        </DialogDescription>

        <!-- 抬头显示行 -->
        <div class="fh-inv__display">
          <span class="fh-inv__text" :class="{ 'is-empty': !title }">
            {{ title || '请输入发票抬头（默认个人抬头）' }}
          </span>
          <span v-if="title" class="fh-inv__count">{{ title.length }}/30</span>
        </div>

        <FhKeyboard @input="handleInput" @backspace="handleBackspace" @clear="handleClear" />

        <!-- 底部操作 -->
        <div class="fh-inv__actions">
          <DialogClose as-child>
            <button class="fh-inv__btn fh-inv__btn--ghost">
              取消
            </button>
          </DialogClose>
          <button class="fh-inv__btn fh-inv__btn--primary" :disabled="!title.trim()" @click="handleConfirm">
            确认抬头
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.fh-inv-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgb(30 40 58 / 45%);
}

.fh-inv {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 101;
  width: 960px;
  max-width: calc(100vw - 64px);
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  transform: translate(-50%, -50%);
  background: var(--fh-surface);
  border-radius: var(--fh-radius-lg);
  border-top: 3px solid var(--fh-gold);
  padding: 28px 32px 26px;
  box-shadow: var(--fh-shadow-float);
  outline: none;
}

.fh-inv__title {
  margin: 0;
  font-family: var(--fh-font-serif);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--fh-text);
}

.fh-inv__desc {
  margin: 6px 0 18px;
  font-size: 14px;
  color: var(--fh-text-3);
}

/* ---- 抬头显示行 ---- */

.fh-inv__display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 72px;
  padding: 0 24px;
  margin-bottom: 16px;
  background: var(--fh-surface-2);
  border: 2px solid var(--fh-gold-line);
  border-radius: var(--fh-radius);
}

.fh-inv__text {
  font-family: var(--fh-font-serif);
  font-size: 28px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--fh-text);
  word-break: break-all;
}

.fh-inv__text.is-empty {
  color: var(--fh-text-3);
  font-size: 18px;
  letter-spacing: 0;
  font-family: inherit;
}

.fh-inv__count {
  flex: none;
  margin-left: 16px;
  font-size: 13px;
  color: var(--fh-text-3);
  font-variant-numeric: tabular-nums;
}

/* ---- 底部操作 ---- */

.fh-inv__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--fh-gold-line);
}

.fh-inv__btn {
  height: 54px;
  padding: 0 36px;
  margin-left: 14px;
  border-radius: var(--fh-radius-sm);
  font-family: inherit;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s ease, background 0.15s ease;
}

.fh-inv__btn--ghost {
  border: 1px solid var(--fh-line-strong);
  background: var(--fh-surface);
  color: var(--fh-text-2);
}

.fh-inv__btn--ghost:hover {
  border-color: var(--fh-ink);
  color: var(--fh-ink);
}

.fh-inv__btn--primary {
  border: none;
  background: linear-gradient(160deg, var(--fh-cta-from) 0%, var(--fh-cta-to) 100%);
  color: var(--fh-cta-ink);
}

.fh-inv__btn--primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

.fh-inv__btn--primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>

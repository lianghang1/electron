<script setup lang="ts">
/**
 * PDF 全屏预览：data URL 交给 Chromium 内置 viewer 渲染（#toolbar=0 隐藏工具栏），
 * 遮罩式浮层，供电子证照 / 发票 / 缴费单据共用。
 */
defineProps<{
  visible: boolean
  title: string
  url: string
}>()

const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

function close(): void {
  emit('update:visible', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fv-fade">
      <div v-if="visible && url" class="fv-mask">
        <header class="fv-bar">
          <h4 class="fv-title">
            {{ title }}
          </h4>
          <button class="fv-close" @click="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            关闭预览
          </button>
        </header>
        <iframe :src="url" class="fv-frame" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fv-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  background: rgb(16 26 48 / 72%);
}

.fv-bar {
  flex: none;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 36px;
  background: linear-gradient(160deg, var(--fh-header-from) 0%, var(--fh-header-to) 100%);
  border-bottom: 2px solid var(--fh-gold-bright);
  color: #fff;
}

.fv-title {
  margin: 0;
  font-family: var(--fh-font-serif);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
}

.fv-close {
  display: inline-flex;
  align-items: center;
  height: 48px;
  padding: 0 26px;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: var(--fh-radius-sm);
  background: rgb(255 255 255 / 12%);
  color: #fff;
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.fv-close:hover {
  background: rgb(255 255 255 / 22%);
}

.fv-close svg {
  width: 16px;
  height: 16px;
  margin-right: 8px;
}

.fv-frame {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: none;
  background: #fff;
  display: block;
}

.fv-fade-enter-active,
.fv-fade-leave-active {
  transition: opacity 0.2s ease;
}

.fv-fade-enter-from,
.fv-fade-leave-to {
  opacity: 0;
}
</style>

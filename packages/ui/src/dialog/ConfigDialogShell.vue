<script setup lang="ts">
/**
 * 配置弹窗外壳：统一承载弹窗 chrome（标题/关闭钮 + 分隔线 + 底部操作区），
 * 高度撑满父容器（父级给定弹窗整体尺寸，如 880×620 卡片），内容区自适应伸缩，
 * 内部滚动交给内容层（如 UiScrollArea）。
 */
defineProps<{
  title: string
  subtitle?: string
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="cfg-shell">
    <header class="cfg-shell__head">
      <div class="cfg-shell__headings">
        <h3 class="cfg-shell__title">
          {{ title }}
        </h3>
        <p v-if="subtitle" class="cfg-shell__sub">
          {{ subtitle }}
        </p>
      </div>
      <button class="cfg-shell__close" title="关闭" @click="emit('close')">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="m4 4 8 8m0-8-8 8" />
        </svg>
      </button>
    </header>

    <div class="cfg-shell__body">
      <slot />
    </div>

    <footer class="cfg-shell__foot">
      <div class="cfg-shell__feedback">
        <slot name="feedback" />
      </div>
      <div class="cfg-shell__actions">
        <slot name="footer" />
      </div>
    </footer>
  </div>
</template>

<style scoped>
.cfg-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: system-ui, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  user-select: none;
}

.cfg-shell__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  height: 52px;
  padding: 0 20px;
  border-bottom: 1px solid #eef1f5;
}

.cfg-shell__headings {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.cfg-shell__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #1f2328;
  flex-shrink: 0;
}

.cfg-shell__sub {
  margin: 0;
  font-size: 11.5px;
  line-height: 16px;
  color: #8a919c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cfg-shell__close {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  padding: 0;
  color: #8a919c;
  cursor: pointer;
  border-radius: 8px;
  flex-shrink: 0;
  transition: background-color 0.12s, color 0.12s;
}

.cfg-shell__close:hover {
  color: #1f2328;
  background: #f3f6f9;
}

.cfg-shell__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.cfg-shell__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  height: 56px;
  padding: 0 20px;
  border-top: 1px solid #eef1f5;
}

.cfg-shell__feedback {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.cfg-shell__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
</style>

<script setup lang="ts">
/**
 * 配置弹窗外壳：统一承载弹窗 chrome（标题/副标题/关闭钮 + 分隔线 + 底部操作区），
 * 内容由使用方经插槽注入。所有配置类弹窗共用，保证弹窗形态一致。
 * bodyHeight 设置后内容区恒高（overflow hidden），内部滚动交给内容层（如 UiScrollArea）。
 */
import { computed } from 'vue'

const props = defineProps<{
  title: string
  subtitle?: string
  /** 内容区固定高度（px）：设置后弹窗高度恒定，超出内容由使用方滚动查看 */
  bodyHeight?: number
}>()

const emit = defineEmits<{ close: [] }>()

const bodyStyle = computed(() => (props.bodyHeight
  ? { height: `${props.bodyHeight}px` }
  : undefined))
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
        ×
      </button>
    </header>

    <div class="cfg-shell__body" :class="{ 'cfg-shell__body--fixed': bodyHeight }" :style="bodyStyle">
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
  padding: 18px 22px 16px;
  font-family: system-ui, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  user-select: none;
}

.cfg-shell__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef1f5;
}

.cfg-shell__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
  color: #1f2328;
}

.cfg-shell__sub {
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #8a919c;
}

.cfg-shell__close {
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 18px;
  line-height: 28px;
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
  padding-top: 16px;
}

/* 固定高度形态：溢出裁切，内部滚动由内容层组件接管 */
.cfg-shell__body--fixed {
  overflow: hidden;
}

.cfg-shell__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 12px;
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

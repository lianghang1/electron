<script setup lang="ts">
/**
 * 通用按钮（原生 button 定稿样式，样式统一收口点）：
 * variant = default / primary / danger / success 四种色调；
 * solid = danger 的实底确认态（删除二次确认等），active = 开关式激活（青底软高亮）；
 * size = sm（紧凑行内）/ md（默认）/ lg（主操作强调）。
 * 原生简单控件自绘不受原语库限制（AGENTS §4.6）；单根节点，class / disabled 等属性透传。
 */
withDefaults(defineProps<{
  variant?: 'default' | 'primary' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  /** danger 的实底确认态 */
  solid?: boolean
  /** 开关式激活态（如预览控制 镜像/旋转） */
  active?: boolean
}>(), {
  variant: 'default',
  size: 'md',
  solid: false,
  active: false,
})
</script>

<template>
  <button
    type="button"
    class="ub"
    :class="[`ub--${variant}`, {
      'ub--sm': size === 'sm',
      'ub--lg': size === 'lg',
      'ub--solid': solid,
      'ub--on': active,
    }]"
  >
    <slot />
  </button>
</template>

<style scoped>
.ub {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 16px;
  border: 1px solid #d5dae1;
  border-radius: 8px;
  background: #fff;
  color: #1f2328;
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.12s, border-color 0.12s, color 0.12s, opacity 0.12s;
}

.ub:hover:not(:disabled):not(.ub--on) {
  border-color: #b8c0cb;
  background: #f3f6f9;
}

.ub:focus-visible {
  outline: 2px solid #99d5cf;
  outline-offset: 1px;
}

.ub:disabled {
  opacity: 0.5;
  cursor: default;
}

.ub--sm {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
}

.ub--lg {
  height: 38px;
  padding: 0 18px;
  font-size: 13px;
  font-weight: 600;
}

.ub--primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #fff;
}

.ub--primary:hover:not(:disabled) {
  border-color: #0d6a63;
  background: #0d6a63;
}

.ub--danger {
  border-color: rgb(220 38 38 / 35%);
  color: #dc2626;
}

.ub--danger:hover:not(:disabled):not(.ub--solid) {
  border-color: #dc2626;
  background: #fef2f2;
}

.ub--danger.ub--solid {
  border-color: #dc2626;
  background: #dc2626;
  color: #fff;
}

.ub--danger.ub--solid:hover:not(:disabled) {
  border-color: #b91c1c;
  background: #b91c1c;
}

.ub--success {
  border-color: rgb(13 159 110 / 35%);
  color: #0d9f6e;
}

.ub--success:hover:not(:disabled) {
  background: #ecfdf5;
}

/* 开关式激活态：青底软高亮，hover 不再变色 */
.ub--on,
.ub--on:hover:not(:disabled) {
  border-color: transparent;
  background: #ccfbf1;
  color: #0f766e;
}
</style>

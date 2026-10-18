<script setup lang="ts">
/**
 * 配置弹窗外壳：统一承载弹窗 chrome（标题/副标题/关闭钮 + 分隔线 + 底部操作区），
 * 内容由使用方经插槽注入。所有设备配置类弹窗共用，保证弹窗形态一致。
 * 多页签形态（系统设置）：传入 tabs 后 header 分隔线由页签行接管，
 * activeTab 走 v-model:active-tab，页签行仅负责切换，页签内容与底部操作由使用方渲染。
 */
const props = defineProps<{
  title: string
  subtitle?: string
  /** 顶部页签定义（系统设置类多页签弹窗），空/缺省 = 单页表单 */
  tabs?: { id: string, label: string }[]
  activeTab?: string
}>()

const emit = defineEmits<{ 'close': [], 'update:activeTab': [id: string] }>()

function selectTab(id: string): void {
  if (id !== props.activeTab) {
    emit('update:activeTab', id)
  }
}
</script>

<template>
  <div class="cfg-shell">
    <header class="cfg-shell__head" :class="{ 'cfg-shell__head--tabbed': tabs?.length }">
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

    <nav v-if="tabs?.length" class="cfg-shell__tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="cfg-shell__tab"
        :class="{ 'cfg-shell__tab--active': tab.id === activeTab }"
        @click="selectTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </nav>

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

/* 多页签形态：header 分隔线隐藏，由页签行底线接管（保持占位高度不变） */
.cfg-shell__head--tabbed {
  border-bottom-color: transparent;
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

.cfg-shell__tabs {
  display: flex;
  gap: 18px;
  border-bottom: 1px solid #eef1f5;
}

.cfg-shell__tab {
  position: relative;
  border: none;
  background: transparent;
  padding: 0 2px 9px;
  font-size: 13px;
  font-family: inherit;
  color: #8a919c;
  cursor: pointer;
  transition: color 0.12s;
}

.cfg-shell__tab:hover {
  color: #1f2328;
}

.cfg-shell__tab--active {
  color: #0f766e;
  font-weight: 600;
}

.cfg-shell__tab--active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: #0f766e;
  border-radius: 2px 2px 0 0;
}

.cfg-shell__body {
  padding-top: 16px;
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

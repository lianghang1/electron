<script setup lang="ts">
import type { OverlayMenuConfig, OverlayMenuItem } from '@desktop/shared'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 浮层菜单页（OverlayWindow 的 renderer，经 #/overlay 路由挂载）：
 * 原生层级压过 WebContentsView，配置由 Main 推送（含定位与主题）。
 * 点击菜单项即回传动作，收起由 Main 统一处理。
 */
const config = ref<OverlayMenuConfig | null>(null)

async function onItem(item: OverlayMenuItem): Promise<void> {
  await window.desktop.overlay.action(item.id)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape')
    void window.desktop.overlay.hideMenu()
}

let unsub: (() => void) | null = null

onMounted(() => {
  unsub = window.desktop.events.on('overlay:show', (value) => {
    config.value = value
    document.documentElement.dataset.theme = value.theme
  })
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  unsub?.()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <!-- 窗口本体透明；菜单块留 12px 外边距承载阴影（与 Main 的 MENU_SHADOW 一一对应） -->
  <Transition name="ov-menu" appear>
    <div v-if="config" class="ov-menu">
      <template v-for="item in config.items" :key="item.id">
        <div v-if="item.separatorBefore" class="ov-menu__sep" />
        <button
          class="ov-menu__item"
          :class="{ 'ov-menu__item--danger': item.danger }"
          @click="onItem(item)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </Transition>
</template>

<style>
/* 浮层窗口页面基座：透明背景 + 无边距（Shell 本体与浮层共用 index.html） */
html,
body {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
}
</style>

<style scoped>
.ov-menu {
  width: 180px;
  margin: 12px;
  padding: 4px;
  background: var(--dt-surface);
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-3);
  box-shadow: var(--dt-shadow-menu);
  box-sizing: border-box;
}
.ov-menu__item {
  display: block;
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: none;
  background: transparent;
  border-radius: var(--dt-radius-1);
  font-size: 12.5px;
  font-family: inherit;
  color: var(--dt-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.ov-menu__item:hover {
  background: var(--dt-hover);
}
.ov-menu__item--danger {
  color: var(--dt-danger-text);
}
.ov-menu__sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--dt-line-soft);
}

.ov-menu-enter-active {
  transition: opacity var(--dt-dur) var(--dt-ease), transform var(--dt-dur) var(--dt-ease);
}
.ov-menu-enter-from {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>

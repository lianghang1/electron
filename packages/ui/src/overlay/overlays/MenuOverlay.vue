<script setup lang="ts">
import type { TabMenuAction } from '@desktop/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * Tab 右键菜单浮层（menu 窗渲染分支）：原生浮层窗承载（页面内容保持可见，无需视图抑制）。
 * 全屏透明层拦截点击（点菜单外 = 关闭），菜单卡锚定 Shell 转发的右键坐标，
 * 固定浅色配色（不随 Shell 主题，浮层页统一策略）；支持键盘导航（ESC 关闭 / 上下移动 / Enter 选中）。
 * 样式全部 scoped 自包含：本包须可在任意宿主应用复用，不依赖宿主的 UnoCSS 管线。
 */
const store = useOverlayStore()

/** 菜单项固定文案与顺序（与旧版 Shell DOM 菜单一致）；动作由 Main 直接执行 */
const MENU_ITEMS: Array<{ action: TabMenuAction, label: string, danger?: boolean }> = [
  { action: 'reload', label: '刷新页面' },
  { action: 'clearCache', label: '清理缓存' },
  { action: 'clearSite', label: '清除站点数据', danger: true },
  { action: 'close', label: '关闭标签页' },
]

/** 实际渲染项：资源模式（Main 按 manifest.kind 下发 closable=false）剔除「关闭标签页」 */
const visibleMenuItems = computed(() =>
  store.menu && !store.menu.closable
    ? MENU_ITEMS.filter(item => item.action !== 'close')
    : MENU_ITEMS,
)

/** 键盘导航高亮项（上下键移动 / Enter 选中）；新菜单弹出时复位 */
const highlightIndex = ref(0)
watch(() => store.menu, () => {
  highlightIndex.value = 0
})

/** 菜单窗键盘导航（show 时窗口持有焦点） */
function onKeydown(e: KeyboardEvent): void {
  if (!store.menu) {
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    store.dismissMenu()
  }
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightIndex.value = (highlightIndex.value + 1) % visibleMenuItems.value.length
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIndex.value = (highlightIndex.value - 1 + visibleMenuItems.value.length) % visibleMenuItems.value.length
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    store.selectMenu(visibleMenuItems.value[highlightIndex.value].action)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

/** 菜单卡锚点定位：Shell 转发的右键坐标（内容区 DIP = 菜单窗内坐标），贴边时向内收 */
const MENU_CARD_W = 190
const MENU_CARD_H = 140
const menuPos = computed(() => {
  if (!store.menu) {
    return { left: '0px', top: '0px' }
  }
  const left = Math.max(4, Math.min(store.menu.x, window.innerWidth - MENU_CARD_W - 8))
  const top = Math.max(4, Math.min(store.menu.y, window.innerHeight - MENU_CARD_H - 8))
  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
})
</script>

<template>
  <!-- 非 dialog 语义（锚点菜单卡，reka Menu 原语需 trigger 不适配浮层窗坐标锚定），外壳自绘 -->
  <div
    v-if="store.menu && store.overlayVisible"
    :key="store.menu.id"
    class="ov-menu ov-anim-fade"
    @contextmenu.prevent
    @pointerdown.self="store.dismissMenu"
  >
    <div
      class="ov-menu__card ov-anim-pop"
      :style="menuPos"
    >
      <template v-for="(item, i) in visibleMenuItems" :key="item.action">
        <div v-if="i === visibleMenuItems.length - 1" class="ov-menu__sep" />
        <button
          class="ov-menu__item"
          :class="{ 'ov-menu__item--danger': item.danger, 'ov-menu__item--active': i === highlightIndex }"
          @pointermove="highlightIndex = i"
          @click="store.selectMenu(item.action)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ov-menu {
  position: fixed;
  inset: 0;
  z-index: 10;
}

.ov-menu__card {
  position: fixed;
  min-width: 184px;
  padding: 4px;
  border: 1px solid rgba(2, 8, 20, 0.1);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(2, 8, 20, 0.18), 0 2px 8px rgba(2, 8, 20, 0.1);
}

.ov-menu__sep {
  height: 1px;
  margin: 4px 6px;
  background: #e8ecf1;
}

.ov-menu__item {
  display: flex;
  align-items: center;
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #1f2328;
  font-family: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s, color 0.12s;
}

.ov-menu__item--danger {
  color: #dc2626;
}

.ov-menu__item--active {
  background: #f3f6f9;
}

.ov-menu__item--danger.ov-menu__item--active {
  background: #fee2e2;
}

.ov-menu__item:focus {
  outline: none;
}
</style>

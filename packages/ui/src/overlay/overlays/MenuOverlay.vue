<script setup lang="ts">
import type { TabMenuAction } from '@desktop/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * Tab 右键菜单浮层（menu 窗渲染分支）：原生浮层窗承载（页面内容保持可见，无需视图抑制）。
 * 全屏透明层拦截点击（点菜单外 = 关闭），菜单卡锚定 Shell 转发的右键坐标，
 * 固定浅色配色（不随 Shell 主题，浮层页统一策略）；支持键盘导航（ESC 关闭 / 上下移动 / Enter 选中）。
 */
const store = useOverlayStore()

/** 菜单项固定文案与顺序（与旧版 Shell DOM 菜单一致）；动作由 Main 直接执行 */
const MENU_ITEMS: Array<{ action: TabMenuAction, label: string, danger?: boolean }> = [
  { action: 'reload', label: '刷新页面' },
  { action: 'clearCache', label: '清理缓存' },
  { action: 'clearSite', label: '清除站点数据', danger: true },
  { action: 'close', label: '关闭标签页' },
]

/** 实际渲染项：套壳模式（Main 按 chrome: 'single' 下发 closable=false）剔除「关闭标签页」 */
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
  <div
    v-if="store.menu && store.overlayVisible"
    :key="store.menu.id"
    class="ov-menu ov-anim-fade fixed inset-0 z-[10]"
    @contextmenu.prevent
    @pointerdown.self="store.dismissMenu"
  >
    <div
      class="ov-menu__card ov-anim-pop fixed min-w-[184px] rounded-[10px] border border-[rgba(2,8,20,0.1)] bg-white p-[4px] shadow-[0_10px_28px_rgba(2,8,20,0.18),0_2px_8px_rgba(2,8,20,0.1)]"
      :style="menuPos"
    >
      <template v-for="(item, i) in visibleMenuItems" :key="item.action">
        <div v-if="i === visibleMenuItems.length - 1" class="ov-menu__sep mx-[6px] my-[4px] h-px bg-[#e8ecf1]" />
        <button
          class="ov-menu__item flex h-[28px] w-full cursor-pointer items-center rounded-[6px] border-none bg-transparent px-[10px] text-left text-[12.5px] font-[inherit] transition-colors duration-[120ms]"
          :class="[
            item.danger ? 'text-[#dc2626]' : 'text-[#1f2328]',
            i === highlightIndex ? (item.danger ? 'bg-[#fee2e2]' : 'bg-[#f3f6f9]') : '',
          ]"
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
/* 菜单项 hover/键盘高亮外的降级：pointermove 已切高亮，无系统 :hover 依赖 */
.ov-menu__item:focus {
  outline: none;
}
</style>

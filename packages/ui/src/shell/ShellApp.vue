<script setup lang="ts">
/**
 * ShellApp：工作台主体（标题栏 tab 条 + 左图标栏 + 内容容器）。
 * 参考稿布局：44px 自绘标题栏（tabs + 设置 + 窗口控制）/ 64px 图标栏 / 圆角内容区。
 * M3 填充完整交互；当前为结构骨架 + 玻璃主题底。
 */
import { ref } from 'vue'
import { Settings, Plus, Minus, Square, X } from 'lucide-vue-next'
import { desktop } from '@shell/bridge/client'

interface ShellTab {
  id: string
  title: string
  iconColor: string
}

const tabs = ref<ShellTab[]>([
  { id: 'home', title: '首页', iconColor: '#3b82f6' },
])
const activeTabId = ref('home')
const railHover = ref<string | null>(null)

function closeTab(id: string) {
  tabs.value = tabs.value.filter(t => t.id !== id)
  if (activeTabId.value === id && tabs.value.length > 0)
    activeTabId.value = tabs.value[0]!.id
}
</script>

<template>
  <div class="shell h-screen w-screen overflow-hidden" style="background: var(--dt-page)">
    <div class="shell-window flex h-full w-full flex-col" style="background: var(--dt-glass); backdrop-filter: var(--dt-blur); border-radius: var(--dt-radius-window)">
      <!-- 标题栏：tab 条 + 设置 + 窗口控制 -->
      <header
        class="flex items-center gap-2 px-3"
        style="height: var(--dt-titlebar-h); border-bottom: 1px solid var(--dt-line)"
      >
        <div class="titlebar-drag flex min-w-0 flex-1 items-center gap-1">
          <div
            v-for="tab in tabs"
            :key="tab.id"
            class="tab flex h-8 cursor-default items-center gap-2 px-3"
            :class="{ 'tab-active': tab.id === activeTabId }"
            style="border-radius: var(--dt-radius); font-size: var(--dt-font-base)"
            @click="activeTabId = tab.id"
          >
            <span class="size-2.5 rounded-md" :style="{ background: tab.iconColor }" />
            <span style="color: var(--dt-text-1)">{{ tab.title }}</span>
            <button class="tab-close ml-1 opacity-40 hover:opacity-100" @click.stop="closeTab(tab.id)">
              <X :size="12" />
            </button>
          </div>
          <button class="new-tab flex size-8 items-center justify-center" style="border-radius: var(--dt-radius); color: var(--dt-text-2)">
            <Plus :size="14" />
          </button>
        </div>
        <button class="ctrl flex size-8 items-center justify-center" style="color: var(--dt-text-2); border-radius: var(--dt-radius)">
          <Settings :size="15" />
        </button>
        <div class="mx-1 h-4 w-px" style="background: var(--dt-line)" />
        <div class="flex items-center">
          <button class="ctrl flex h-8 w-11 items-center justify-center" style="color: var(--dt-text-2)" @click="desktop().window.minimize()">
            <Minus :size="13" />
          </button>
          <button class="ctrl flex h-8 w-11 items-center justify-center" style="color: var(--dt-text-2)" @click="desktop().window.toggleMaximize()">
            <Square :size="11" />
          </button>
          <button class="ctrl flex h-8 w-11 items-center justify-center hover:bg-[#ef4444] hover:text-white" style="border-radius: 0 var(--dt-radius) 0 0" @click="desktop().window.close()">
            <X :size="13" />
          </button>
        </div>
      </header>

      <div class="flex min-h-0 flex-1">
        <!-- 左图标栏（折叠形态：纯图标 + tooltip） -->
        <nav
          class="flex flex-col items-center gap-1.5 py-3"
          style="width: var(--dt-rail-w); border-right: 1px solid var(--dt-line)"
        >
          <div
            v-for="tab in tabs"
            :key="tab.id"
            class="relative"
            @mouseenter="railHover = tab.id"
            @mouseleave="railHover = null"
          >
            <button
              class="rail-icon flex items-center justify-center"
              :class="{ 'rail-icon-active': tab.id === activeTabId }"
              :style="{ width: 'var(--dt-icon-size)', height: 'var(--dt-icon-size)', borderRadius: 'var(--dt-radius-icon)', background: tab.iconColor }"
              @click="activeTabId = tab.id"
            />
            <span
              v-if="railHover === tab.id"
              class="tooltip absolute left-full z-50 ml-2 whitespace-nowrap px-2.5 py-1.5"
              style="background: #1c2433; color: #fff; font-size: var(--dt-font-caption); border-radius: 8px"
            >{{ tab.title }}</span>
          </div>
          <button
            class="rail-icon flex items-center justify-center"
            :style="{ width: 'var(--dt-icon-size)', height: 'var(--dt-icon-size)', borderRadius: 'var(--dt-radius-icon)', border: '1px dashed var(--dt-line)', color: 'var(--dt-text-3)' }"
          >
            <Plus :size="16" />
          </button>
        </nav>

        <!-- 内容容器：embedded 路由 / app:// 视图挂载点（M2 接 AppRuntime） -->
        <main class="min-w-0 flex-1 p-2">
          <div
            class="flex h-full w-full items-center justify-center"
            style="background: var(--dt-surface); border-radius: var(--dt-radius); color: var(--dt-text-3); font-size: var(--dt-font-base)"
          >
            Shell v2 · 工作台就绪（M2 接入 AppRuntime 内容视图）
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell-window {
  box-shadow: 0 24px 80px rgb(15 30 70 / 0.18), 0 0 0 1px var(--dt-line);
}
.tab { transition: background 0.12s ease; }
.tab:hover { background: var(--dt-surface-hover); }
.tab-active { background: var(--dt-surface); box-shadow: 0 1px 6px rgb(15 30 70 / 0.08); }
.ctrl:hover { background: var(--dt-surface-hover); }
.rail-icon { transition: transform 0.12s ease, box-shadow 0.12s ease; }
.rail-icon:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgb(15 30 70 / 0.16); }
.rail-icon-active { outline: 2px solid var(--dt-accent); outline-offset: 2px; }
.titlebar-drag { -webkit-app-region: drag; }
.titlebar-drag button, .tab { -webkit-app-region: no-drag; }
</style>

<script setup lang="ts">
/**
 * ShellApp：壳 chrome 渲染（按 flavor.chrome 档位分支）。
 * - platform：完整壳——44px tab 条 / 64px 图标栏 / 应用启动器 / 空状态兜底
 * - solo：容器隐形——仅 desktop 模式留 30px 窗口控制条（拖拽+三键），
 *   应用启动直出全屏；kiosk 连控制条都没有（纯全屏容器）
 * 三形态应用的宿主：
 * - embedded：内容区直接渲染注册组件（同进程，零桥接开销）
 * - packaged/remote：主进程 WebContentsView 盖在内容区矩形上（rect 经桥上报）
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Settings, Plus, Minus, Square, X, LayoutGrid, AppWindow } from 'lucide-vue-next'
import { desktop } from '@shell/bridge/client'
import { resolveEmbeddedRoute } from '../apps/registry'
import EmptyState from '../apps/pages/EmptyState.vue'
import SettingsDialog from './SettingsDialog.vue'

/** 工作台 tab：embedded 路由页或视图实例（packaged/remote） */
interface ShellTab {
  key: string
  kind: 'embedded' | 'view'
  title: string
  iconColor: string
  route?: string
  instanceId?: string
  appId?: string
}

interface AppSummary {
  manifest: { id: string, name: string, icon?: string }
}

const TAB_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4']

/** 无常驻首页：platform 档 tabs 空 = 空状态页；solo 档启动直达 defaultAppId */
const tabs = ref<ShellTab[]>([])
const activeKey = ref('')
const chrome = ref<'platform' | 'solo'>('platform')
const mode = ref<'desktop' | 'kiosk'>('desktop')
const railHover = ref<string | null>(null)
const appList = ref<AppSummary[]>([])
const showAppLauncher = ref(false)
const showSettings = ref(false)
const contentEl = ref<HTMLElement | null>(null)

const activeTab = computed(() => tabs.value.find(t => t.key === activeKey.value))

/** 内容区矩形 = 主元素相对窗口内容原点（chrome 高度由布局自然决定，主进程不猜） */
let resizeObserver: ResizeObserver | undefined

function reportRect() {
  const el = contentEl.value
  if (!el)
    return
  const r = el.getBoundingClientRect()
  desktop().reportContentRect({ x: r.left, y: r.top, width: r.width, height: r.height })
}

function activate(tab: ShellTab) {
  activeKey.value = tab.key
  // view 形态：主进程显示该实例视图；embedded：传空实例号 = 全部视图隐藏
  void desktop().apps.activate(tab.instanceId ?? '')
}

function colorFor(appId: string): string {
  let hash = 0
  for (const ch of appId)
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return TAB_COLORS[hash % TAB_COLORS.length]!
}

/** tab 图标：彩色方块内的白色线性图标（全界面唯一允许的颜色） */

async function openApp(appId: string) {
  const result = await desktop().apps.open(appId) as { instanceId: string, handle: Record<string, unknown> }
  const manifest = appList.value.find(a => a.manifest.id === appId)?.manifest
  const kind = result.handle.route !== undefined ? 'embedded' : 'view'
  const target = tabs.value.find(t => t.instanceId === result.instanceId)
    ?? tabs.value.find(t => t.appId === appId && t.kind === 'embedded')
  if (target) {
    showAppLauncher.value = false
    activate(target)
    return
  }
  const tab: ShellTab = {
    key: result.instanceId,
    kind,
    title: manifest?.name ?? appId,
    iconColor: colorFor(appId),
    route: result.handle.route as string | undefined,
    instanceId: kind === 'view' ? result.instanceId : undefined,
    appId,
  }
  tabs.value.push(tab)
  showAppLauncher.value = false
  activate(tab)
}

function closeTab(tab: ShellTab) {
  tabs.value = tabs.value.filter(t => t.key !== tab.key)
  if (tab.instanceId)
    void desktop().apps.close(tab.instanceId)
  if (activeKey.value === tab.key) {
    const next = tabs.value[tabs.value.length - 1]
    if (next)
      activate(next)
    else {
      // 全关 = 回空状态页（主进程隐藏全部视图）
      activeKey.value = ''
      void desktop().apps.activate('')
    }
  }
}

onMounted(async () => {
  reportRect()
  resizeObserver = new ResizeObserver(reportRect)
  if (contentEl.value)
    resizeObserver.observe(contentEl.value)
  window.addEventListener('resize', reportRect)

  const list = await desktop().apps.list() as AppSummary[]
  appList.value = list

  // 档位与直达：solo 档启动即铺满 defaultAppId；platform 档配置了也直达
  const info = await desktop().shell.info()
  chrome.value = info.chrome
  mode.value = info.mode
  if (info.defaultAppId && list.some(a => a.manifest.id === info.defaultAppId))
    void openApp(info.defaultAppId)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', reportRect)
})
</script>

<template>
  <div class="shell h-screen w-screen overflow-hidden" style="background: var(--dt-page)">
    <div class="shell-window relative flex h-full w-full flex-col" style="background: var(--dt-glass); backdrop-filter: var(--dt-blur); border-radius: var(--dt-radius-window)">
      <!-- platform：完整 tab chrome；solo：30px 窗口控制条；kiosk：无 chrome -->
      <header
        v-if="chrome === 'platform'"
        class="flex items-center gap-2 px-3"
        style="height: var(--dt-titlebar-h); border-bottom: 1px solid var(--dt-line)"
      >
        <div class="titlebar-drag flex min-w-0 flex-1 items-center gap-1.5">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="tab flex h-9 cursor-default items-center gap-2 px-2.5"
            :class="{ 'tab-active': tab.key === activeKey }"
            style="border-radius: var(--dt-radius); font-size: var(--dt-font-base)"
            @click="activate(tab)"
          >
            <span
              class="flex size-5 shrink-0 items-center justify-center rounded-md text-white"
              :style="{ background: tab.iconColor }"
            >
              <AppWindow :size="12" :stroke-width="2.4" />
            </span>
            <span class="font-medium" style="color: var(--dt-text-1)">{{ tab.title }}</span>
            <button class="tab-close ml-0.5 opacity-0 hover:opacity-100" @click.stop="closeTab(tab)">
              <X :size="12" />
            </button>
          </div>
          <button
            class="new-tab flex size-8 items-center justify-center"
            style="border-radius: var(--dt-radius); color: var(--dt-text-2)"
            @click="showAppLauncher = !showAppLauncher"
          >
            <Plus :size="15" />
          </button>
        </div>
        <button class="ctrl flex size-8 items-center justify-center" style="color: var(--dt-text-2); border-radius: var(--dt-radius)" @click="showSettings = true">
          <Settings :size="16" />
        </button>
        <div class="mx-1 h-4 w-px" style="background: var(--dt-line)" />
        <div class="flex items-center">
          <button class="ctrl flex h-9 w-11 items-center justify-center" style="color: var(--dt-text-1)" @click="desktop().window.minimize()">
            <Minus :size="15" />
          </button>
          <button class="ctrl flex h-9 w-11 items-center justify-center" style="color: var(--dt-text-1)" @click="desktop().window.toggleMaximize()">
            <Square :size="13" />
          </button>
          <button class="ctrl ctrl-close flex h-9 w-11 items-center justify-center" style="color: var(--dt-text-1); border-radius: 0 var(--dt-radius) 0 0" @click="desktop().window.close()">
            <X :size="15" />
          </button>
        </div>
      </header>

      <!-- solo（desktop）：30px 玻璃细条 = 拖拽区 + 窗口三键，无任何壳功能件 -->
      <header
        v-else-if="mode === 'desktop'"
        class="flex items-center"
        style="height: 30px; background: var(--dt-glass); border-bottom: 1px solid var(--dt-line)"
      >
        <span class="titlebar-drag h-full flex-1" />
        <div class="flex h-full items-center">
          <button class="ctrl flex h-full w-11 items-center justify-center" style="color: var(--dt-text-1)" @click="desktop().window.minimize()">
            <Minus :size="13" />
          </button>
          <button class="ctrl flex h-full w-11 items-center justify-center" style="color: var(--dt-text-1)" @click="desktop().window.toggleMaximize()">
            <Square :size="11" />
          </button>
          <button class="ctrl ctrl-close flex h-full w-11 items-center justify-center" style="color: var(--dt-text-1)" @click="desktop().window.close()">
            <X :size="13" />
          </button>
        </div>
      </header>

      <div class="flex min-h-0 flex-1">
        <!-- 左图标栏（仅 platform 档；折叠形态：纯图标 + tooltip） -->
        <nav
          v-if="chrome === 'platform'"
          class="flex flex-col items-center gap-1.5 py-3"
          style="width: var(--dt-rail-w); border-right: 1px solid var(--dt-line)"
        >
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="relative"
            @mouseenter="railHover = tab.key"
            @mouseleave="railHover = null"
          >
            <button
              class="rail-icon flex items-center justify-center text-white"
              :class="{ 'rail-icon-active': tab.key === activeKey }"
              :style="{ width: 'var(--dt-icon-size)', height: 'var(--dt-icon-size)', borderRadius: 'var(--dt-radius-icon)', background: tab.iconColor }"
              @click="activate(tab)"
            >
              <AppWindow :size="19" :stroke-width="2.2" />
            </button>
            <span
              v-if="railHover === tab.key"
              class="tooltip absolute left-full z-50 ml-2 whitespace-nowrap px-2.5 py-1.5"
              style="background: #1c2433; color: #fff; font-size: var(--dt-font-caption); border-radius: 8px"
            >{{ tab.title }}</span>
          </div>
          <button
            class="rail-icon flex items-center justify-center"
            style="width: var(--dt-icon-size); height: var(--dt-icon-size); border-radius: var(--dt-radius-icon); border: 1px dashed var(--dt-line); color: var(--dt-text-3)"
            @click="showAppLauncher = !showAppLauncher"
          >
            <Plus :size="16" />
          </button>
        </nav>

        <!-- 内容容器：platform 有边距+圆角卡片；solo 全屏直出（accent 垫场防视图白屏） -->
        <main
          ref="contentEl"
          class="relative min-w-0 flex-1 overflow-hidden"
          :class="chrome === 'platform' ? 'p-2' : ''"
          :style="chrome === 'solo' ? 'background: var(--dt-accent)' : ''"
        >
          <template v-if="chrome === 'platform'">
            <!-- 无 tab = 空状态页（时钟兜底） -->
            <EmptyState v-if="!activeTab" class="h-full w-full" @open="openApp" />
            <component
              :is="resolveEmbeddedRoute(activeTab.route!)"
              v-else-if="activeTab.kind === 'embedded' && activeTab.route"
              class="h-full w-full overflow-hidden"
              style="background: var(--dt-surface); border-radius: var(--dt-radius)"
            />
          </template>
          <template v-else>
            <!-- solo：唯一应用直出（embedded 组件 / view 透明区） -->
            <component
              :is="resolveEmbeddedRoute(activeTab!.route!)"
              v-if="activeTab?.kind === 'embedded' && activeTab.route"
              class="h-full w-full overflow-hidden"
              style="background: var(--dt-surface)"
            />
          </template>
          <!-- view 形态：此区域保持透明/垫场，WebContentsView 由主进程定位在此矩形 -->
        </main>
      </div>

      <!-- 应用启动器（新 tab + 号触发，仅 platform 档） -->
      <div
        v-if="showAppLauncher && chrome === 'platform'"
        class="absolute right-4 z-50 w-72 rounded-xl p-2 shadow-xl"
        style="top: calc(var(--dt-titlebar-h) + 8px); background: var(--dt-glass); border: 1px solid var(--dt-line); backdrop-filter: var(--dt-blur)"
      >
        <p class="px-2 py-1.5 text-xs" style="color: var(--dt-text-3)">
          <LayoutGrid :size="12" class="mr-1 inline" />应用中心
        </p>
        <button
          v-for="app in appList"
          :key="app.manifest.id"
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[var(--dt-hover)]"
          @click="openApp(app.manifest.id)"
        >
          <span class="size-6 rounded-md" :style="{ background: colorFor(app.manifest.id) }" />
          <span class="text-sm" style="color: var(--dt-text-1)">{{ app.manifest.name }}</span>
        </button>
        <p v-if="appList.length === 0" class="px-2 py-3 text-xs" style="color: var(--dt-text-3)">
          暂无应用——flavor.json 的 apps 清单为空
        </p>
      </div>

      <!-- 统一设置（schema 驱动面板） -->
      <SettingsDialog v-if="chrome === 'platform'" v-model:open="showSettings" />
    </div>
  </div>
</template>

<style scoped>
/* 自绘标题栏拖拽：拖拽区全局生效，可点组件必须显式豁免 */
.titlebar-drag {
  -webkit-app-region: drag;
}
.tab,
.new-tab {
  -webkit-app-region: no-drag;
}

/* tab：非 active 透明，active 白底浮起（参考稿的玻璃胶囊） */
.tab {
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.tab:hover {
  background: var(--dt-hover);
}
.tab-active {
  background: var(--dt-surface);
  box-shadow: 0 2px 10px rgb(28 36 51 / 0.10);
}
.tab-close {
  color: var(--dt-text-3);
  border-radius: 6px;
  padding: 2px;
  transition: opacity 0.12s ease, background 0.12s ease;
}
.tab:hover .tab-close,
.tab-active .tab-close {
  opacity: 0.7;
}
.tab-close:hover {
  background: var(--dt-hover);
  opacity: 1 !important;
}
.new-tab,
.ctrl {
  transition: background 0.12s ease;
}
.new-tab:hover,
.ctrl:hover {
  background: var(--dt-hover);
}
.ctrl-close:hover {
  background: #ef4444 !important;
  color: #fff !important;
}

/* 左侧图标栏：选中加同色描边浮起，hover 微升 */
.rail-icon {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.rail-icon:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgb(28 36 51 / 0.18);
}
.rail-icon-active {
  box-shadow:
    0 0 0 2.5px var(--dt-surface),
    0 0 0 4px var(--dt-accent-soft),
    0 6px 14px rgb(59 130 246 / 0.28);
}
</style>

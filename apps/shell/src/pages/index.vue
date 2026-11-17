<script setup lang="ts">
import { shell } from '@shell/bridge/client'
import { onBeforeUnmount, onMounted } from 'vue'

const { chrome, mode, forceRequiredVersion, start, dispose } = useWorkbenchBoot()
const { tabs, activeKey, activeTab, activate, closeTab, moveTab, recentIds } = useShellTabs()
const { activeViewState, retryActive } = useViewStates(activeTab)

function openSettings() {
  void shell().overlay.present({ surface: 'settings' })
}

/** 应用中心：Ctrl+K / tab 条加号 / 设置旁入口唤起 plane 浮层表面——页内渲染会被应用的 WebContentsView 整体遮挡；最近使用随载荷注入（plane 独立分区读不到壳侧 localStorage），IPC structured clone 拒收响应式 Proxy，必须传浅拷贝 */
function openAppCenter() {
  void shell().overlay.present({ surface: 'app-center', payload: { recentIds: [...recentIds.value] } })
}

function minimize() {
  void shell().window.minimize()
}

function maximize() {
  void shell().window.toggleMaximize()
}

function closeWindow() {
  void shell().window.close()
}

useWorkbenchShortcuts({ chrome, tabs, activeKey, activate, openAppCenter })

onMounted(async () => {
  await start()
  // 启动握手第二棒：boot 完成 + 首帧 rAF 后上报首绘，启动层据此撤层
  requestAnimationFrame(() => {
    window.shell?.markFirstPaint()
    window.dispatchEvent(new Event('shell-app-ready'))
  })
})

onBeforeUnmount(() => {
  dispose()
})
</script>

<template>
  <WorkbenchForceGate v-if="forceRequiredVersion !== null" class="h-full w-full" />
  <div v-else class="shell h-screen w-screen overflow-hidden bg-background">
    <div class="shell-window relative flex h-full w-full flex-col rounded-xl bg-background/85 ring-1 ring-border backdrop-blur-xl backdrop-saturate-150">
      <!-- 平台档：自适应标题栏（logo + tabs + 窗口控制） -->
      <WorkbenchTitleBar
        v-if="chrome === 'platform'"
        :tabs="tabs"
        :active-key="activeKey"
        @activate="activate"
        @close="closeTab"
        @move="moveTab"
        @open-app-center="openAppCenter"
        @open-settings="openSettings"
        @minimize="minimize"
        @maximize="maximize"
        @close-window="closeWindow"
      />
      <!-- solo 档：仅桌面形态需要窗口控制条，kiosk 全屏锁定无控制条 -->
      <WorkbenchSoloTitleBar
        v-else-if="mode === 'windowed'"
        :title="activeTab?.title ?? null"
        @minimize="minimize"
        @maximize="maximize"
        @close-window="closeWindow"
      />
      <WorkbenchViewStage
        :chrome="chrome"
        :active-tab="activeTab"
        :view-state="activeViewState"
        @retry="retryActive"
      />
    </div>
  </div>
</template>

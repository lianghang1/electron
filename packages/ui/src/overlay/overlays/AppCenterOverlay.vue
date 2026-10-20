<script setup lang="ts">
import type { AppPermissionState, DesktopTab, RegisteredApp } from '@desktop/shared'
import { permissionLabel } from '@desktop/shared'
import { AccordionContent, AccordionHeader, AccordionItem, AccordionRoot, AccordionTrigger, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogRoot, AlertDialogTitle } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useOverlayStore } from '../use-overlay-store'

/**
 * 应用中心浮层：全屏遮罩 + 居中卡片（原生浮层窗承载，盖过 Shell Web 容器区域）。
 * 数据经桥自取（应用列表 / Tab 运行态），窗口为常驻复用，每次显示时刷新；
 * 卡片样式固定高对比配色，不随 Shell 主题（浮层窗与 Shell 不同 partition，主题态不可达）。
 */
const store = useOverlayStore()

const apps = ref<RegisteredApp[]>([])
const tabs = ref<DesktopTab[]>([])

async function refresh(): Promise<void> {
  try {
    const [appList, tabList] = await Promise.all([
      window.desktop.app.list(),
      window.desktop.tabs.list(),
    ])
    apps.value = appList
    tabs.value = tabList
  }
  catch (error) {
    console.error('[AppCenterOverlay] 应用数据拉取失败', error)
  }
}

// 预加载页面在窗口隐藏时就绪，首次 immediate 拉取 + 每次显示再刷新一次
watch(() => store.overlayVisible, (visible) => {
  if (visible) {
    void refresh()
  }
}, { immediate: true })

const SOURCE_LABELS: Record<RegisteredApp['source'], string> = {
  'code': '内置',
  'apps.json': '本地配置',
  'remote': '远程',
}

/** 展开的权限详情（reka-ui Accordion 单开模式）：切换即重新拉取以反映最新决策 */
const expandedId = ref<string>('')
const permissionStates = ref<AppPermissionState[]>([])
const permissionLoading = ref(false)

watch(expandedId, async (appId) => {
  if (!appId) {
    permissionStates.value = []
    return
  }
  permissionLoading.value = true
  try {
    permissionStates.value = await window.desktop.permission.list(appId)
  }
  finally {
    permissionLoading.value = false
  }
})

/** 清理完成后的按钮成功提示 */
const doneKey = ref<string | null>(null)

function clearKey(appId: string, kind: 'cache' | 'site' | 'perm'): string {
  return `${appId}:${kind}`
}

async function clearApp(appId: string, kind: 'cache' | 'site'): Promise<void> {
  await window.desktop.cache[kind === 'cache' ? 'clear' : 'clearSite'](appId)
  doneKey.value = clearKey(appId, kind)
  setTimeout(() => {
    if (doneKey.value === clearKey(appId, kind)) { doneKey.value = null }
  }, 2000)
}

/** 有按需授权决策时才显示「重置授权」：无决策 = 无可撤销 */
const hasRuntimeDecisions = computed(() =>
  permissionStates.value.some(state => !state.declared && state.granted !== null))

/** 撤销该 App 的全部运行时授权：决策清空后，下次请求会重新弹授权条 */
async function resetPerms(appId: string): Promise<void> {
  await window.desktop.permission.reset(appId)
  permissionStates.value = await window.desktop.permission.list(appId)
  const key = clearKey(appId, 'perm')
  doneKey.value = key
  setTimeout(() => {
    if (doneKey.value === key) { doneKey.value = null }
  }, 2000)
}

// ---- 敏感操作确认（reka AlertDialog）：清除站点数据 = 登出、重置授权 = 撤销决策 ----
// 弹窗不 Portal，控制在卡片区域内模态（卡片为定位基准）
const confirmTarget = ref<{ appId: string, name: string, kind: 'site' | 'perm' } | null>(null)
// AlertDialog 的内部关闭时序与确认按钮的 click 不保证先后，操作负载在询问时固化，
// 确认时读取快照而不是可能已被关闭流程清空的 confirmTarget
const pendingAction = ref<{ appId: string, kind: 'site' | 'perm' } | null>(null)

function askConfirm(appId: string, kind: 'site' | 'perm'): void {
  const app = apps.value.find(item => item.manifest.id === appId)
  confirmTarget.value = { appId, name: app?.manifest.name ?? appId, kind }
  pendingAction.value = { appId, kind }
}

function closeConfirm(): void {
  confirmTarget.value = null
  pendingAction.value = null
}

function onOpenChange(value: boolean): void {
  if (value) { return }
  closeConfirm()
}

async function onConfirm(): Promise<void> {
  const action = pendingAction.value
  if (!action) { return }
  closeConfirm()
  try {
    if (action.kind === 'site') { await clearApp(action.appId, 'site') }
    else { await resetPerms(action.appId) }
  }
  catch (error) {
    console.error('[AppCenterOverlay] 确认操作执行失败', error)
  }
}

/** 关闭浮层：确认弹窗打开时先由 AlertDialog 自行处理，不连坐关闭整个面板 */
function dismiss(): void {
  if (confirmTarget.value) { return }
  store.dismissAppCenter()
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    dismiss()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})

/** 打开应用：Main 在主窗开 Tab，浮层随即收起 */
function openApp(appId: string): void {
  void window.desktop.tabs.open({ appId })
  store.dismissAppCenter()
}

/** 权限状态文案：声明 = 平台直接放行；未声明看运行时用户决策 */
function stateText(state: AppPermissionState): string {
  if (state.declared) { return '已声明' }
  if (state.granted === true) { return '已授权' }
  if (state.granted === false) { return '已拒绝' }
  return '按需询问'
}

function stateClass(state: AppPermissionState): string {
  if (state.declared || state.granted === true) { return 'ac-perm__state--ok' }
  if (state.granted === false) { return 'ac-perm__state--deny' }
  return 'ac-perm__state--pending'
}

function isRunning(appId: string): boolean {
  return tabs.value.some(tab => tab.appId === appId)
}
</script>

<template>
  <div v-if="store.appCenterOpen && store.overlayVisible" class="ov-appcenter">
    <div class="ov-appcenter__mask" @click="dismiss" />

    <div class="ov-appcenter__card">
      <header class="ac-header">
        <span class="ac-title">应用中心</span>
        <button class="ac-close" title="关闭" @click="dismiss">
          <svg viewBox="0 0 10 10" width="9" height="9"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" /></svg>
        </button>
      </header>

      <!-- reka-ui Accordion（单开）：只接管展开态与无障碍交互，外观完全自绘 -->
      <AccordionRoot
        v-model="expandedId"
        type="single"
        collapsible
        class="ac-list"
      >
        <p v-if="apps.length === 0" class="ac-empty">
          暂无已注册应用
        </p>

        <AccordionItem
          v-for="app in apps"
          :key="app.manifest.id"
          :value="app.manifest.id"
          class="ac-card"
        >
          <AccordionHeader class="ac-card__row">
            <button
              class="ac-card__main"
              :title="`打开 ${app.manifest.name}`"
              @click="openApp(app.manifest.id)"
            >
              <img
                v-if="app.manifest.icon"
                :src="app.manifest.icon"
                alt=""
                class="ac-card__icon"
              >
              <span v-else class="ac-card__icon ac-card__icon--letter">{{ app.manifest.name.slice(0, 1) }}</span>
              <span class="ac-card__meta">
                <span class="ac-card__name">
                  {{ app.manifest.name }}
                  <span v-if="isRunning(app.manifest.id)" class="ac-card__running" title="运行中" />
                </span>
                <span class="ac-card__info">
                  v{{ app.manifest.version }} · {{ SOURCE_LABELS[app.source] }} · {{ app.manifest.type === 'internal' ? '内部' : '第三方' }}
                </span>
              </span>
            </button>
            <AccordionTrigger class="ac-card__toggle" title="权限详情">
              ›
            </AccordionTrigger>
          </AccordionHeader>

          <AccordionContent class="ac-card__content">
            <div class="ac-card__detail">
              <p v-if="permissionLoading" class="ac-hint">
                加载中…
              </p>
              <p v-else-if="permissionStates.length === 0" class="ac-hint">
                无权限记录
              </p>
              <template v-else>
                <div
                  v-for="state in permissionStates"
                  :key="state.permission"
                  class="ac-perm"
                >
                  <span class="ac-perm__name">{{ permissionLabel(state.permission) }}</span>
                  <span class="ac-perm__state" :class="stateClass(state)">{{ stateText(state) }}</span>
                </div>
              </template>

              <div class="ac-clear">
                <button
                  v-if="hasRuntimeDecisions"
                  class="ac-clear__btn"
                  :class="{ 'ac-clear__btn--done': doneKey === clearKey(app.manifest.id, 'perm') }"
                  @click.stop="askConfirm(app.manifest.id, 'perm')"
                >
                  {{ doneKey === clearKey(app.manifest.id, 'perm') ? '已重置' : '重置授权' }}
                </button>
                <button
                  class="ac-clear__btn"
                  :class="{ 'ac-clear__btn--done': doneKey === clearKey(app.manifest.id, 'cache') }"
                  @click.stop="clearApp(app.manifest.id, 'cache')"
                >
                  {{ doneKey === clearKey(app.manifest.id, 'cache') ? '已清理' : '清理缓存' }}
                </button>
                <button
                  class="ac-clear__btn ac-clear__btn--danger"
                  @click.stop="askConfirm(app.manifest.id, 'site')"
                >
                  {{ doneKey === clearKey(app.manifest.id, 'site') ? '已清理' : '清除站点数据' }}
                </button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>

      <!-- 敏感操作确认：reka AlertDialog 承担模态语义 / 焦点圈养 / ESC；不 Portal，卡片内模态 -->
      <AlertDialogRoot
        :open="confirmTarget !== null"
        @update:open="onOpenChange"
      >
        <AlertDialogContent class="ac-confirm">
          <AlertDialogOverlay class="ac-confirm__scrim" />
          <div class="ac-confirm__card">
            <AlertDialogTitle class="ac-confirm__title">
              {{ confirmTarget?.kind === 'site' ? '清除站点数据？' : '重置授权？' }}
            </AlertDialogTitle>
            <AlertDialogDescription class="ac-confirm__desc">
              {{ confirmTarget?.kind === 'site'
                ? `将清除「${confirmTarget?.name}」的全部站点数据（Cookie / 登录态等），效果等于退出登录。`
                : `将撤销「${confirmTarget?.name}」的全部运行时授权决策，下次使用时会重新询问。` }}
            </AlertDialogDescription>
            <div class="ac-confirm__actions">
              <AlertDialogCancel class="ac-confirm__btn">
                取消
              </AlertDialogCancel>
              <!-- 确认按钮不用 AlertDialogAction：其内部关闭会先清空 confirmTarget，导致 click 回调读到空值 -->
              <button
                type="button"
                class="ac-confirm__btn ac-confirm__btn--danger"
                @click="onConfirm"
              >
                {{ confirmTarget?.kind === 'site' ? '确认清除' : '确认重置' }}
              </button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialogRoot>
    </div>
  </div>
</template>

<style scoped>
.ov-appcenter {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ov-appcenter__mask {
  position: absolute;
  inset: 0;
  background: rgb(15 23 42 / 55%);
  animation: ac-fade 0.16s ease;
}
.ov-appcenter__card {
  position: relative;
  width: 380px;
  height: min(620px, 88vh);
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgb(2 8 20 / 10%), 0 24px 56px rgb(2 8 20 / 24%);
  overflow: hidden;
  animation: ac-pop 0.18s cubic-bezier(0.2, 0.9, 0.25, 1);
}
.ac-header {
  height: 48px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 18px;
  border-bottom: 1px solid #ededf0;
}
.ac-title {
  font-size: 14px;
  font-weight: 600;
  color: #1b1b1f;
}
.ac-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: #5b5b64;
  cursor: pointer;
  transition: background 0.14s, color 0.14s;
}
.ac-close:hover {
  background: #f0f0f2;
  color: #1b1b1f;
}
.ac-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.ac-empty,
.ac-hint {
  font-size: 12px;
  color: #9d9da6;
  padding: 8px;
  margin: 0;
}
.ac-card {
  border-radius: 8px;
}
.ac-card + .ac-card {
  margin-top: 2px;
}
.ac-card__row {
  display: flex;
  align-items: center;
}
.ac-card__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 10px 8px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.14s;
}
.ac-card__main:hover {
  background: #f0f0f2;
}
.ac-card__icon {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 8px;
  margin-right: 10px;
  object-fit: cover;
}
.ac-card__icon--letter {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d9488;
  color: #ffffff;
  font-size: 14px;
}
.ac-card__meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ac-card__name {
  font-size: 13px;
  font-weight: 600;
  color: #1b1b1f;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ac-card__running {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: #0d9f6e;
  margin-left: 6px;
}
.ac-card__info {
  font-size: 12px;
  color: #9d9da6;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ac-card__toggle {
  width: 28px;
  height: 28px;
  flex: none;
  margin-left: 4px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 16px;
  line-height: 1;
  color: #9d9da6;
  cursor: pointer;
  transition: transform 0.15s, background 0.14s, color 0.14s;
}
.ac-card__toggle:hover {
  background: #f0f0f2;
  color: #5b5b64;
}
.ac-card__toggle[data-state='open'] {
  transform: rotate(90deg);
}
.ac-card__content[data-state='open'] {
  animation: ac-slide-down 0.15s cubic-bezier(0.2, 0.9, 0.25, 1);
}
@keyframes ac-slide-down {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.ac-card__detail {
  margin: 0 8px 8px 50px;
  padding: 8px 10px;
  background: #f7f7f8;
  border: 1px solid #ededf0;
  border-radius: 8px;
}
.ac-perm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 12px;
}
.ac-perm + .ac-perm {
  border-top: 1px solid #ededf0;
}
.ac-perm__name {
  color: #5b5b64;
}
.ac-perm__state {
  flex: none;
}
.ac-perm__state--ok {
  color: #0d9f6e;
}
.ac-perm__state--deny {
  color: #d92d20;
}
.ac-perm__state--pending {
  color: #9d9da6;
}
.ac-clear {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #ededf0;
}
.ac-clear__btn {
  flex: 1;
  height: 26px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #ffffff;
  font-size: 12px;
  font-family: inherit;
  color: #5b5b64;
  cursor: pointer;
  transition: background 0.14s, color 0.14s, border-color 0.14s;
}
.ac-clear__btn:hover {
  background: #f0f0f2;
}
.ac-clear__btn--danger {
  color: #d92d20;
  border-color: rgb(217 45 32 / 35%);
}
.ac-clear__btn--danger:hover {
  background: #fef3f2;
}
.ac-clear__btn--done {
  color: #0d9f6e;
  border-color: rgb(13 159 110 / 35%);
}

/* 敏感操作确认弹窗：卡片内模态（不 Portal），遮罩 + 居中卡片 */
.ac-confirm {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ac-confirm__scrim {
  position: absolute;
  inset: 0;
  background: rgb(15 23 42 / 32%);
  animation: ac-fade 0.16s ease;
}
.ac-confirm__card {
  position: relative;
  width: 300px;
  box-sizing: border-box;
  padding: 16px;
  background: #ffffff;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgb(2 8 20 / 18%);
  animation: ac-pop 0.18s cubic-bezier(0.2, 0.9, 0.25, 1);
}
.ac-confirm__title {
  margin: 0 0 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: #1b1b1f;
}
.ac-confirm__desc {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: #5b5b64;
}
.ac-confirm__actions {
  display: flex;
  justify-content: flex-end;
}
.ac-confirm__btn {
  height: 28px;
  margin-left: 8px;
  padding: 0 14px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #ffffff;
  font-size: 12px;
  font-family: inherit;
  color: #5b5b64;
  cursor: pointer;
  transition: background 0.14s, color 0.14s;
}
.ac-confirm__btn:hover {
  background: #f0f0f2;
}
.ac-confirm__btn--danger {
  border-color: #d92d20;
  background: #d92d20;
  color: #ffffff;
}
.ac-confirm__btn--danger:hover {
  background: #bf291b;
}
@keyframes ac-fade {
  from {
    opacity: 0;
  }
}
@keyframes ac-pop {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}
</style>

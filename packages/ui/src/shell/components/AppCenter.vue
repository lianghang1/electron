<script setup lang="ts">
import type { AppPermissionState, DesktopTab, RegisteredApp } from '@desktop/shared'
import { permissionLabel } from '@desktop/shared'
import { AccordionContent, AccordionHeader, AccordionItem, AccordionRoot, AccordionTrigger, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogRoot, AlertDialogTitle } from 'reka-ui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  /** 注册表全量条目（含来源） */
  apps: RegisteredApp[]
  /** 当前 Tab 列表：用于点亮运行状态 */
  tabs: DesktopTab[]
}>()

const emit = defineEmits<{ open: [appId: string], close: [] }>()

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
// 面板宽度有限，弹窗不 Portal，控制在面板区域内模态（aside 为定位基准）
const confirmTarget = ref<{ appId: string, name: string, kind: 'site' | 'perm' } | null>(null)
// AlertDialog 的内部关闭时序与确认按钮的 click 不保证先后，操作负载在询问时固化，
// 确认时读取快照而不是可能已被关闭流程清空的 confirmTarget
const pendingAction = ref<{ appId: string, kind: 'site' | 'perm' } | null>(null)

function askConfirm(appId: string, kind: 'site' | 'perm'): void {
  const app = props.apps.find(item => item.manifest.id === appId)
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
    console.error('[AppCenter] 确认操作执行失败', error)
  }
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
  return props.tabs.some(tab => tab.appId === appId)
}
</script>

<template>
  <aside class="ac-panel">
    <header class="ac-header">
      <span class="ac-title">应用中心</span>
      <button class="ac-close" title="收起应用中心" @click="emit('close')">
        ✕
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
            @click="emit('open', app.manifest.id)"
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

    <!-- 敏感操作确认：reka AlertDialog 承担模态语义 / 焦点圈养 / ESC；
         面板区域有限，不 Portal，控制在 360px 面板内模态（aside 为定位基准） -->
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
  </aside>
</template>

<style scoped>
.ac-panel {
  position: relative;
  width: 360px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--dt-surface);
  border-right: 1px solid var(--dt-line);
  min-height: 0;
  transition: background var(--dt-dur) var(--dt-ease), border-color var(--dt-dur) var(--dt-ease);
}
.ac-header {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--dt-line-soft);
}
.ac-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dt-text);
}
.ac-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--dt-radius-1);
  font-size: 12px;
  color: var(--dt-text-2);
  cursor: pointer;
}
.ac-close:hover {
  background: var(--dt-hover);
}
.ac-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.ac-empty,
.ac-hint {
  font-size: 12px;
  color: var(--dt-text-3);
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
  transition: background var(--dt-dur) var(--dt-ease);
}
.ac-card__main:hover {
  background: var(--dt-hover);
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
  background: var(--dt-brand);
  color: var(--dt-brand-on);
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
  color: var(--dt-text);
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
  background: var(--dt-success);
  margin-left: 6px;
}
.ac-card__info {
  font-size: 12px;
  color: var(--dt-text-3);
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
  border-radius: var(--dt-radius-1);
  font-size: 16px;
  line-height: 1;
  color: var(--dt-text-3);
  cursor: pointer;
  transition: transform 0.15s var(--dt-ease), background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.ac-card__toggle:hover {
  background: var(--dt-hover);
  color: var(--dt-text-2);
}
.ac-card__toggle[data-state='open'] {
  transform: rotate(90deg);
}
.ac-card__content[data-state='open'] {
  animation: ac-slide-down 0.15s var(--dt-ease);
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
  background: var(--dt-surface-2);
  border: 1px solid var(--dt-line-soft);
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
  border-top: 1px solid var(--dt-line-soft);
}
.ac-perm__name {
  color: var(--dt-text-2);
}
.ac-perm__state {
  flex: none;
}
.ac-perm__state--ok {
  color: var(--dt-success);
}
.ac-perm__state--deny {
  color: var(--dt-danger-text);
}
.ac-perm__state--pending {
  color: var(--dt-text-3);
}
.ac-clear {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--dt-line-soft);
}
.ac-clear__btn {
  flex: 1;
  height: 26px;
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-1);
  background: var(--dt-surface);
  font-size: 12px;
  font-family: inherit;
  color: var(--dt-text-2);
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease), border-color var(--dt-dur) var(--dt-ease);
}
.ac-clear__btn:hover {
  background: var(--dt-hover);
}
.ac-clear__btn--danger {
  color: var(--dt-danger-text);
  border-color: color-mix(in srgb, var(--dt-danger) 35%, transparent);
}
.ac-clear__btn--danger:hover {
  background: var(--dt-danger-soft);
}
.ac-clear__btn--done {
  color: var(--dt-success);
  border-color: color-mix(in srgb, var(--dt-success) 35%, transparent);
}

/* 敏感操作确认弹窗：面板内模态（不 Portal），遮罩 + 居中卡片 */
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
  background: var(--dt-surface);
  border: 1px solid var(--dt-line);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgb(2 8 20 / 18%);
  animation: ac-pop 0.18s var(--dt-ease);
}
.ac-confirm__title {
  margin: 0 0 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--dt-text);
}
.ac-confirm__desc {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dt-text-2);
}
.ac-confirm__actions {
  display: flex;
  justify-content: flex-end;
}
.ac-confirm__btn {
  height: 28px;
  margin-left: 8px;
  padding: 0 14px;
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-1);
  background: var(--dt-surface);
  font-size: 12px;
  font-family: inherit;
  color: var(--dt-text-2);
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.ac-confirm__btn:hover {
  background: var(--dt-hover);
}
.ac-confirm__btn--danger {
  border-color: var(--dt-danger);
  background: var(--dt-danger);
  color: #ffffff;
}
.ac-confirm__btn--danger:hover {
  background: color-mix(in srgb, var(--dt-danger) 88%, #000);
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

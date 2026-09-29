<script setup lang="ts">
import type { AppPermissionState, DesktopTab, RegisteredApp } from '@desktop/shared'
import { AccordionContent, AccordionHeader, AccordionItem, AccordionRoot, AccordionTrigger } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { permissionLabel } from '../composables/use-permission-labels'

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

/** 清除站点数据需二次点击确认（等于该容器登出），3s 不点则复原 */
const pendingKey = ref<string | null>(null)
/** 清理完成后的按钮成功提示 */
const doneKey = ref<string | null>(null)

function clearKey(appId: string, kind: 'cache' | 'site' | 'perm'): string {
  return `${appId}:${kind}`
}

async function clearApp(appId: string, kind: 'cache' | 'site'): Promise<void> {
  const key = clearKey(appId, kind)
  if (kind === 'site' && pendingKey.value !== key) {
    pendingKey.value = key
    setTimeout(() => {
      if (pendingKey.value === key)
        pendingKey.value = null
    }, 3000)
    return
  }
  pendingKey.value = null
  await window.desktop.cache[kind === 'cache' ? 'clear' : 'clearSite'](appId)
  doneKey.value = key
  setTimeout(() => {
    if (doneKey.value === key)
      doneKey.value = null
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
    if (doneKey.value === key)
      doneKey.value = null
  }, 2000)
}

/** 权限状态文案：声明 = 平台直接放行；未声明看运行时用户决策 */
function stateText(state: AppPermissionState): string {
  if (state.declared)
    return '已声明'
  if (state.granted === true)
    return '已授权'
  if (state.granted === false)
    return '已拒绝'
  return '按需询问'
}

function stateClass(state: AppPermissionState): string {
  if (state.declared || state.granted === true)
    return 'ac-perm__state--ok'
  if (state.granted === false)
    return 'ac-perm__state--deny'
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
                @click.stop="resetPerms(app.manifest.id)"
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
                @click.stop="clearApp(app.manifest.id, 'site')"
              >
                {{ pendingKey === clearKey(app.manifest.id, 'site')
                  ? '将退出登录，再点一次确认'
                  : doneKey === clearKey(app.manifest.id, 'site') ? '已清理' : '清除站点数据' }}
              </button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </AccordionRoot>
  </aside>
</template>

<style scoped>
.ac-panel {
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
</style>

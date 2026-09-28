<script setup lang="ts">
import type { AppPermissionState, DesktopTab, RegisteredApp } from '@desktop/shared'
import { ref } from 'vue'
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

/** 当前展开权限详情的 App（同时只展开一个，切换即重新拉取以反映最新决策） */
const expandedId = ref<string | null>(null)
const permissionStates = ref<AppPermissionState[]>([])
const permissionLoading = ref(false)

/** 清除站点数据需二次点击确认（等于该容器登出），3s 不点则复原 */
const pendingKey = ref<string | null>(null)
/** 清理完成后的按钮成功提示 */
const doneKey = ref<string | null>(null)

function clearKey(appId: string, kind: 'cache' | 'site'): string {
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

async function toggleExpand(appId: string): Promise<void> {
  if (expandedId.value === appId) {
    expandedId.value = null
    return
  }
  expandedId.value = appId
  permissionLoading.value = true
  try {
    permissionStates.value = await window.desktop.permission.list(appId)
  }
  finally {
    permissionLoading.value = false
  }
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

    <div class="ac-list">
      <p v-if="apps.length === 0" class="ac-empty">
        暂无已注册应用
      </p>

      <div v-for="app in apps" :key="app.manifest.id" class="ac-card">
        <div class="ac-card__row">
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
          <button
            class="ac-card__toggle"
            :class="{ 'ac-card__toggle--open': expandedId === app.manifest.id }"
            title="权限详情"
            @click.stop="toggleExpand(app.manifest.id)"
          >
            ›
          </button>
        </div>

        <div v-if="expandedId === app.manifest.id" class="ac-card__detail">
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
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ac-panel {
  width: 360px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  min-height: 0;
}
.ac-header {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid #f3f4f6;
}
.ac-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2328;
}
.ac-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
}
.ac-close:hover {
  background: #f3f4f6;
}
.ac-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.ac-empty,
.ac-hint {
  font-size: 12px;
  color: #9ca3af;
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
}
.ac-card__main:hover {
  background: #f3f4f6;
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
  background: #3370ff;
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
  color: #1f2328;
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
  color: #9ca3af;
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
  border-radius: 6px;
  font-size: 16px;
  line-height: 1;
  color: #9ca3af;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.ac-card__toggle:hover {
  background: #f3f4f6;
  color: #4b5563;
}
.ac-card__toggle--open {
  transform: rotate(90deg);
}
.ac-card__detail {
  margin: 0 8px 8px 50px;
  padding: 8px 10px;
  background: #f9fafb;
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
  border-top: 1px solid #f3f4f6;
}
.ac-perm__name {
  color: #4b5563;
}
.ac-perm__state {
  flex: none;
}
.ac-perm__state--ok {
  color: #0d9f6e;
}
.ac-perm__state--deny {
  color: #ef4444;
}
.ac-perm__state--pending {
  color: #9ca3af;
}
.ac-clear {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
}
.ac-clear__btn {
  flex: 1;
  height: 26px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
}
.ac-clear__btn:hover {
  background: #f3f4f6;
}
.ac-clear__btn--danger {
  color: #ef4444;
  border-color: #fecaca;
}
.ac-clear__btn--danger:hover {
  background: #fef2f2;
}
.ac-clear__btn--done {
  color: #0d9f6e;
  border-color: #a7f3d0;
}
</style>

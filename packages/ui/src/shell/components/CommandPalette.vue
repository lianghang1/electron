<script setup lang="ts">
import type { DesktopTab, RegisteredApp } from '@desktop/shared'
import { DialogContent, DialogDescription, DialogOverlay, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * Ctrl+K 命令面板：应用 / 标签页 / Shell 动作的统一键盘入口。
 * 打开态与检索自管理；动作经事件交由 ShellApp 执行（单向数据流），
 * 模态语义（焦点圈养 / ESC / 遮罩）由 reka Dialog 承担。
 */
const props = defineProps<{
  apps: RegisteredApp[]
  tabs: DesktopTab[]
}>()

const emit = defineEmits<{
  openApp: [appId: string]
  activateTab: [tabId: string]
  toggleTheme: []
  toggleCenter: []
}>()

interface Command {
  id: string
  label: string
  hint: string
  run: () => void
}

const open = ref(false)
const query = ref('')
const cursor = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

const commands = computed<Command[]>(() => {
  const list: Command[] = props.apps.map(app => ({
    id: `app:${app.manifest.id}`,
    label: app.manifest.name,
    hint: '打开应用',
    run: () => emit('openApp', app.manifest.id),
  }))
  list.push(...props.tabs.map(tab => ({
    id: `tab:${tab.id}`,
    label: tab.title,
    hint: '切换标签页',
    run: () => emit('activateTab', tab.id),
  })))
  list.push(
    { id: 'action:theme', label: '切换深浅主题', hint: '外观', run: () => emit('toggleTheme') },
    { id: 'action:center', label: '打开应用中心', hint: '面板', run: () => emit('toggleCenter') },
  )
  return list
})

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) { return commands.value }
  return commands.value.filter(cmd => cmd.label.toLowerCase().includes(keyword))
})

watch(open, (value) => {
  if (value) {
    query.value = ''
    cursor.value = 0
    // 等内容渲染后落焦搜索框（reka 焦点圈养已就位）
    requestAnimationFrame(() => { inputEl.value?.focus() })
  }
})

watch(filtered, () => { cursor.value = 0 })

function onGlobalKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value = !open.value
  }
}

/** 输入框内键盘导航：Enter 时阻止按钮原生激活，执行仅触发一次 */
function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    cursor.value = Math.min(cursor.value + 1, filtered.value.length - 1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    cursor.value = Math.max(cursor.value - 1, 0)
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    runCommand(filtered.value[cursor.value])
  }
}

function runCommand(cmd: Command | undefined): void {
  if (!cmd) { return }
  open.value = false
  cmd.run()
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <DialogRoot :open="open" @update:open="open = $event">
    <DialogOverlay class="cp-scrim" />
    <DialogContent class="cp-card">
      <DialogTitle class="cp-sr">
        命令面板
      </DialogTitle>
      <DialogDescription class="cp-sr">
        搜索应用、标签页与快捷动作
      </DialogDescription>
      <div class="cp-search">
        <svg class="cp-search__icon" viewBox="0 0 14 14" width="13" height="13">
          <circle cx="6.2" cy="6.2" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4" />
          <path d="M9.4 9.4 12.6 12.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
        <input
          ref="inputEl"
          v-model="query"
          class="cp-search__input"
          placeholder="搜索应用、标签页或动作…"
          @keydown="onInputKeydown"
        >
        <kbd class="cp-kbd">esc</kbd>
      </div>
      <div class="cp-list">
        <p v-if="filtered.length === 0" class="cp-empty">
          没有匹配的结果
        </p>
        <button
          v-for="(cmd, index) in filtered"
          :key="cmd.id"
          class="cp-item"
          :class="{ 'cp-item--active': index === cursor }"
          :title="cmd.label"
          @click="runCommand(cmd)"
          @mousemove="cursor = index"
        >
          <span class="cp-item__label">{{ cmd.label }}</span>
          <span class="cp-item__hint">{{ cmd.hint }}</span>
        </button>
      </div>
      <footer class="cp-foot">
        <span><kbd class="cp-kbd">↑</kbd><kbd class="cp-kbd">↓</kbd> 选择</span>
        <span><kbd class="cp-kbd">↵</kbd> 执行</span>
      </footer>
    </DialogContent>
  </DialogRoot>
</template>

<style scoped>
.cp-scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: color-mix(in srgb, #09090b 45%, transparent);
  animation: cp-fade var(--dt-dur) var(--dt-ease);
}
/* 水平居中用 margin auto，避免动画 transform 与位移叠加互覆盖 */
.cp-card {
  position: fixed;
  top: 16%;
  left: 0;
  right: 0;
  margin: 0 auto;
  z-index: 61;
  width: 560px;
  max-width: calc(100vw - 48px);
  border: 1px solid var(--dt-line);
  border-radius: var(--dt-radius-4);
  background: var(--dt-surface);
  box-shadow: var(--dt-shadow-pop);
  overflow: hidden;
  animation: cp-pop var(--dt-dur-slow) var(--dt-ease);
}

.cp-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--dt-line-soft);
}
.cp-search__icon {
  flex: none;
  color: var(--dt-text-3);
}
.cp-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: var(--dt-text);
}
.cp-search__input::placeholder {
  color: var(--dt-text-3);
}

.cp-list {
  max-height: 340px;
  overflow-y: auto;
  padding: 6px;
}
.cp-empty {
  padding: 26px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--dt-text-3);
}
.cp-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: none;
  background: transparent;
  border-radius: var(--dt-radius-2);
  padding: 9px 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--dt-text-2);
  text-align: left;
  cursor: pointer;
  transition: background var(--dt-dur) var(--dt-ease), color var(--dt-dur) var(--dt-ease);
}
.cp-item--active {
  background: var(--dt-brand-soft);
  color: var(--dt-brand-text);
}
.cp-item__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-item__hint {
  flex: none;
  font-size: 11px;
  color: var(--dt-text-3);
}

.cp-foot {
  display: flex;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--dt-line-soft);
  font-size: 11px;
  color: var(--dt-text-3);
}
.cp-kbd {
  display: inline-block;
  padding: 1px 5px;
  margin-right: 3px;
  border: 1px solid var(--dt-line);
  border-radius: 5px;
  background: var(--dt-surface-2);
  font-size: 10px;
  font-family: inherit;
  color: var(--dt-text-2);
  line-height: 1.5;
}

.cp-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@keyframes cp-fade {
  from {
    opacity: 0;
  }
}
@keyframes cp-pop {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
  }
}
</style>

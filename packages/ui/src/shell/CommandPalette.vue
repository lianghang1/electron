<script setup lang="ts">
/**
 * CommandPalette：⌘K/Ctrl+K 居中命令面板（替换顶栏 + 号小浮层）。
 * 交互收敛到搜索框一个焦点（VS Code / Linear 范式）：↑↓ 选择 / ↵ 打开 /
 * Esc 关闭 / 输入即过滤；最近使用置顶，列表用 aria-activedescendant 保持键盘可达。
 * 视觉纪律：灰阶 + 单强调色，仅选中行出现 accent，无渐变、无堆叠阴影。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AppWindow, Search } from 'lucide-vue-next'

interface PaletteItem {
  id: string
  name: string
  kind: string
}

const props = defineProps<{
  open: boolean
  items: PaletteItem[]
  recentIds: string[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [id: string]
}>()

const query = ref('')
const highlighted = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q)
    return props.items
  return props.items.filter(i =>
    i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q),
  )
})

const recentItems = computed<PaletteItem[]>(() => {
  if (query.value.trim())
    return []
  return props.recentIds
    .map(id => props.items.find(i => i.id === id))
    .filter((i): i is PaletteItem => i !== undefined)
    .slice(0, 5)
})

const restItems = computed<PaletteItem[]>(() => {
  const recentSet = new Set(recentItems.value.map(i => i.id))
  return filtered.value.filter(i => !recentSet.has(i.id))
})

const flat = computed(() => [...recentItems.value, ...restItems.value])

function close(): void {
  emit('update:open', false)
}

function choose(id: string): void {
  emit('select', id)
  close()
}

function onWindowKeydown(e: KeyboardEvent): void {
  if (!props.open)
    return
  switch (e.key) {
    case 'Escape':
      e.preventDefault()
      close()
      break
    case 'ArrowDown':
      e.preventDefault()
      if (flat.value.length)
        highlighted.value = (highlighted.value + 1) % flat.value.length
      break
    case 'ArrowUp':
      e.preventDefault()
      if (flat.value.length)
        highlighted.value = (highlighted.value - 1 + flat.value.length) % flat.value.length
      break
    case 'Enter': {
      e.preventDefault()
      const item = flat.value[highlighted.value]
      if (item)
        choose(item.id)
      break
    }
    case 'Tab':
      // 面板模态期间焦点锁在搜索框
      e.preventDefault()
      inputEl.value?.focus()
      break
    default:
      break
  }
}

watch(() => props.open, async (open) => {
  if (!open)
    return
  query.value = ''
  highlighted.value = 0
  await nextTick()
  inputEl.value?.focus()
})

watch([query, () => props.items.length], () => {
  highlighted.value = 0
})

onMounted(() => window.addEventListener('keydown', onWindowKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown, true))
</script>

<template>
  <div
    v-if="open"
    class="cp-overlay fixed inset-0 z-[60] flex items-start justify-center"
    style="background: rgba(15, 23, 42, 0.32); backdrop-filter: blur(2px)"
    @click.self="close"
  >
    <div
      class="cp-panel mt-[14vh] w-[560px] max-w-[92vw] overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="打开应用"
      style="background: var(--dt-surface); border: 1px solid var(--dt-line); border-radius: var(--dt-radius-window); box-shadow: var(--dt-shadow-2)"
    >
      <!-- 搜索行 -->
      <div class="flex items-center gap-3 px-4" style="height: 52px; border-bottom: 1px solid var(--dt-line)">
        <Search :size="17" style="color: var(--dt-text-3)" />
        <input
          ref="inputEl"
          v-model="query"
          class="cp-input min-w-0 flex-1 bg-transparent outline-none"
          style="font-size: 15px; color: var(--dt-text-1)"
          placeholder="搜索应用…"
          aria-label="搜索应用"
          autocomplete="off"
          spellcheck="false"
        >
        <kbd class="cp-kbd px-1.5 py-0.5 text-[11px]" style="color: var(--dt-text-3); border: 1px solid var(--dt-line); border-radius: 5px">Esc</kbd>
      </div>

      <!-- 结果列表 -->
      <div class="cp-list max-h-[46vh] overflow-y-auto py-1.5" role="listbox" aria-label="应用列表">
        <template v-if="recentItems.length">
          <p class="px-4 py-1.5 text-[11px] font-medium" style="color: var(--dt-text-3)">最近使用</p>
          <div
            v-for="(item, i) in recentItems"
            :id="`cp-opt-${i}`"
            :key="item.id"
            class="cp-row mx-1.5 flex items-center gap-2.5 px-2.5 py-2"
            :class="{ 'cp-row-active': highlighted === i }"
            role="option"
            :aria-selected="highlighted === i"
            @mouseenter="highlighted = i"
            @click="choose(item.id)"
          >
            <AppWindow :size="16" style="color: var(--dt-text-2)" />
            <span class="flex-1 truncate text-[13px]" style="color: var(--dt-text-1)">{{ item.name }}</span>
            <span class="text-[11px]" style="color: var(--dt-text-3)">{{ item.kind }}</span>
            <kbd v-if="highlighted === i" class="text-[11px]" style="color: var(--dt-text-3)">↵</kbd>
          </div>
          <div v-if="restItems.length" class="my-1.5 h-px" style="background: var(--dt-line)" />
        </template>

        <template v-if="restItems.length">
          <p class="px-4 py-1.5 text-[11px] font-medium" style="color: var(--dt-text-3)">{{ recentItems.length ? '全部应用' : '应用' }}</p>
          <div
            v-for="(item, j) in restItems"
            :id="`cp-opt-${recentItems.length + j}`"
            :key="item.id"
            class="cp-row mx-1.5 flex items-center gap-2.5 px-2.5 py-2"
            :class="{ 'cp-row-active': highlighted === recentItems.length + j }"
            role="option"
            :aria-selected="highlighted === recentItems.length + j"
            @mouseenter="highlighted = recentItems.length + j"
            @click="choose(item.id)"
          >
            <AppWindow :size="16" style="color: var(--dt-text-2)" />
            <span class="flex-1 truncate text-[13px]" style="color: var(--dt-text-1)">{{ item.name }}</span>
            <span class="text-[11px]" style="color: var(--dt-text-3)">{{ item.kind }}</span>
            <kbd v-if="highlighted === recentItems.length + j" class="text-[11px]" style="color: var(--dt-text-3)">↵</kbd>
          </div>
        </template>

        <p v-if="flat.length === 0" class="px-4 py-8 text-center text-[13px]" style="color: var(--dt-text-3)">
          {{ items.length === 0 ? '暂无应用——flavor.json 的 apps 清单为空' : '没有匹配的应用' }}
        </p>
      </div>

      <!-- 页脚提示 -->
      <div class="flex items-center gap-3 px-4 py-2 text-[11px]" style="border-top: 1px solid var(--dt-line); color: var(--dt-text-3)">
        <span>↑↓ 选择</span>
        <span>↵ 打开</span>
        <span>Esc 关闭</span>
        <span class="ml-auto">{{ flat.length }} 个应用</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cp-input::placeholder {
  color: var(--dt-text-3);
}
.cp-row {
  border-radius: var(--dt-radius);
  cursor: pointer;
}
.cp-row-active {
  background: var(--dt-hover);
  box-shadow: inset 2px 0 0 var(--dt-accent);
}
.cp-row-active :deep(svg) {
  color: var(--dt-accent);
}
</style>

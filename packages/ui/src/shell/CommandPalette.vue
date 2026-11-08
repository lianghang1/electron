<script setup lang="ts">
import { Kbd, Separator } from '@ui/components/ui'
import { AppWindow, Search } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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
  'select': [id: string]
}>()

const query = ref('')
const highlighted = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) { return props.items }
  return props.items.filter(i =>
    i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q),
  )
})

const recentItems = computed<PaletteItem[]>(() => {
  if (query.value.trim()) { return [] }
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
  if (!props.open) { return }
  switch (e.key) {
    case 'Escape':
      e.preventDefault()
      close()
      break
    case 'ArrowDown':
      e.preventDefault()
      if (flat.value.length) { highlighted.value = (highlighted.value + 1) % flat.value.length }
      break
    case 'ArrowUp':
      e.preventDefault()
      if (flat.value.length) { highlighted.value = (highlighted.value - 1 + flat.value.length) % flat.value.length }
      break
    case 'Enter': {
      e.preventDefault()
      const item = flat.value[highlighted.value]
      if (item) { choose(item.id) }
      break
    }
    case 'Tab':
      e.preventDefault()
      inputEl.value?.focus()
      break
    default:
      break
  }
}

watch(() => props.open, async (open) => {
  if (!open) { return }
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
    class="cp-overlay fixed inset-0 z-[60] flex items-start justify-center bg-overlay backdrop-blur-[2px]"
    @click.self="close"
  >
    <div
      class="cp-panel mt-[14vh] w-[560px] max-w-[92vw] overflow-hidden rounded-window border border-border bg-popover text-popover-foreground shadow-float"
      role="dialog"
      aria-modal="true"
      aria-label="打开应用"
    >
      <div class="flex h-13 items-center gap-3 border-b border-border px-4">
        <Search :size="17" class="text-foreground-subtle" />
        <input
          ref="inputEl"
          v-model="query"
          class="cp-input min-w-0 flex-1 bg-transparent text-ui-lg text-foreground outline-none"
          placeholder="搜索应用…"
          aria-label="搜索应用"
          autocomplete="off"
          spellcheck="false"
        >
        <Kbd>Esc</Kbd>
      </div>

      <div class="cp-list max-h-[46vh] overflow-y-auto py-1.5" role="listbox" aria-label="应用列表">
        <template v-if="recentItems.length">
          <p class="px-4 py-1.5 text-ui-sm font-medium text-foreground-subtle">
            最近使用
          </p>
          <div
            v-for="(item, i) in recentItems"
            :id="`cp-opt-${i}`"
            :key="item.id"
            class="cp-row mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2"
            :class="{ 'cp-row-active': highlighted === i }"
            role="option"
            :aria-selected="highlighted === i"
            @mouseenter="highlighted = i"
            @click="choose(item.id)"
          >
            <AppWindow :size="16" class="text-muted-foreground" />
            <span class="flex-1 truncate text-ui-base text-foreground">{{ item.name }}</span>
            <span class="text-ui-sm text-foreground-subtle">{{ item.kind }}</span>
            <Kbd v-if="highlighted === i">↵</Kbd>
          </div>
          <Separator v-if="restItems.length" class="my-1.5" />
        </template>

        <template v-if="restItems.length">
          <p class="px-4 py-1.5 text-ui-sm font-medium text-foreground-subtle">
            {{ recentItems.length ? '全部应用' : '应用' }}
          </p>
          <div
            v-for="(item, j) in restItems"
            :id="`cp-opt-${recentItems.length + j}`"
            :key="item.id"
            class="cp-row mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2"
            :class="{ 'cp-row-active': highlighted === recentItems.length + j }"
            role="option"
            :aria-selected="highlighted === recentItems.length + j"
            @mouseenter="highlighted = recentItems.length + j"
            @click="choose(item.id)"
          >
            <AppWindow :size="16" class="text-muted-foreground" />
            <span class="flex-1 truncate text-ui-base text-foreground">{{ item.name }}</span>
            <span class="text-ui-sm text-foreground-subtle">{{ item.kind }}</span>
            <Kbd v-if="highlighted === recentItems.length + j">↵</Kbd>
          </div>
        </template>

        <p v-if="flat.length === 0" class="px-4 py-8 text-center text-ui-base text-foreground-subtle">
          {{ items.length === 0 ? '暂无应用——flavor.json 的 apps 清单为空' : '没有匹配的应用' }}
        </p>
      </div>

      <div class="flex items-center gap-3 border-t border-border px-4 py-2 text-ui-sm text-foreground-subtle">
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
  color: var(--foreground-subtle);
}
.cp-row-active {
  background: var(--hover);
  box-shadow: inset 2px 0 0 var(--ring);
}
.cp-row-active :deep(svg) {
  color: var(--ring);
}
</style>

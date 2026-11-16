<script setup lang="ts">
import type { SettingField, SettingGroup, SettingsValues, ThemePreference } from '@shell/shared'
import { shell } from '@shell/bridge/client'
import { Button, Input, Switch } from '@ui/components'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { applyAccent, applyTheme } from '../../styles/appearance'

const props = defineProps<{ open: boolean, isKiosk?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const ACCENT_RE = /^#[0-9a-f]{6}$/i

interface AppSummary {
  manifest: { id: string, name: string }
}

const schema = ref<SettingGroup[]>([])
const values = ref<SettingsValues>({})
const apps = ref<AppSummary[]>([])
const busy = ref(false)
const actionError = ref('')

/** 卡片窗 ESC = 关闭（窗口即模态边界，无需遮罩/焦点陷阱） */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('update:open', false)
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  const snap = await shell().settings.all() as { schema: SettingGroup[], values: SettingsValues }
  schema.value = snap.schema
  values.value = snap.values
  try {
    apps.value = await shell().apps.list() as AppSummary[]
  }
  catch {
    apps.value = []
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

async function clearAppData(appId: string, scope: 'cache' | 'site-data'): Promise<void> {
  busy.value = true
  actionError.value = ''
  try {
    if (scope === 'cache') { await shell().sessions.clearCache(appId) }
    else { await shell().sessions.clearSiteData(appId) }
  }
  catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  }
  finally { busy.value = false }
}

function fieldValue(group: string, field: SettingField): unknown {
  return values.value[group]?.[field.key] ?? field.default
}

const THEME_VALUES = ['light', 'dark', 'system'] as const

function asThemePreference(value: unknown): ThemePreference | undefined {
  return THEME_VALUES.includes(value as ThemePreference) ? value as ThemePreference : undefined
}

async function setField(group: string, field: SettingField, value: unknown) {
  values.value[group] = { ...values.value[group], [field.key]: value }
  const key = `${group}.${field.key}`
  const theme = key === 'appearance.theme' ? asThemePreference(value) : undefined
  if (theme) { applyTheme(theme) }
  if (key === 'appearance.accent') { applyAccent(String(value)) }
  await shell().settings.set(key, value)
}

function visibleFields(group: SettingGroup) {
  return group.fields.filter(f => !(props.isKiosk && f.hiddenInKiosk))
}
</script>

<template>
  <!-- 卡片窗自持落位：窗口 = 卡片 + 32px 透明边距（overlay-host 策略表 624×664），
       边距里画投影；窗口本身即模态边界，不再有遮罩与居中定位 -->
  <div class="set-card">
    <header class="set-card__head">
      <h3 class="set-card__title">
        设置
      </h3>
      <button class="set-card__close" title="关闭设置" @click="emit('update:open', false)">
        ×
      </button>
    </header>

    <div class="set-card__body">
      <div v-for="group in schema" :key="group.key" class="mb-5 last:mb-0">
        <p class="mb-2 text-ui-sm font-medium text-foreground-subtle">
          {{ group.label }}
        </p>
        <div class="overflow-hidden rounded-md border border-border">
          <div
            v-for="field in visibleFields(group)"
            :key="field.key"
            class="flex items-center justify-between gap-4 border-b border-border px-3.5 py-3 last:border-b-0"
          >
            <div class="min-w-0">
              <p class="text-ui-base text-foreground">
                {{ field.label }}
              </p>
              <p v-if="field.description" class="mt-0.5 text-ui-sm text-foreground-subtle">
                {{ field.description }}
              </p>
            </div>
            <Switch
              v-if="field.type === 'boolean'"
              :model-value="fieldValue(group.key, field) === true"
              @update:model-value="v => setField(group.key, field, v)"
            />
            <div v-else-if="field.type === 'enum'" class="flex gap-1">
              <Button
                v-for="opt in field.options ?? []"
                :key="opt.value"
                size="sm"
                :variant="fieldValue(group.key, field) === opt.value ? 'default' : 'outline'"
                @click="setField(group.key, field, opt.value)"
              >
                {{ opt.label }}
              </Button>
            </div>
            <Input
              v-else
              class="w-40"
              :model-value="String(fieldValue(group.key, field))"
              @update:model-value="v => setField(group.key, field, field.type === 'number' ? Number(v) : v)"
            />
          </div>
        </div>
      </div>

      <div>
        <p class="mb-2 text-ui-sm font-medium text-foreground-subtle">
          应用数据
        </p>
        <div class="overflow-hidden rounded-md border border-border">
          <div
            v-for="app in apps"
            :key="app.manifest.id"
            class="flex items-center justify-between gap-4 border-b border-border px-3.5 py-3 last:border-b-0"
          >
            <div class="min-w-0">
              <p class="truncate text-ui-base text-foreground">
                {{ app.manifest.name }}
              </p>
              <p class="mt-0.5 truncate text-ui-xs text-foreground-subtle">
                {{ app.manifest.id }}
              </p>
            </div>
            <div class="flex shrink-0 gap-1">
              <Button size="xs" variant="outline" :disabled="busy" @click="clearAppData(app.manifest.id, 'cache')">
                清缓存
              </Button>
              <Button size="xs" variant="outline" :disabled="busy" @click="clearAppData(app.manifest.id, 'site-data')">
                清站点数据
              </Button>
            </div>
          </div>
          <p v-if="apps.length === 0" class="px-3.5 py-3 text-ui-sm text-foreground-subtle">
            暂无已注册应用
          </p>
        </div>
        <p v-if="actionError" class="mt-1.5 text-ui-xs text-destructive">
          {{ actionError }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 颜色走语义层变量（tokens 随浮层页加载）：与拍摄卡同一浮层配色体系 */
.set-card {
  /* 卡片窗自持落位：窗口 624×664 = 卡片 560×600 + 四周 32px 投影边距 */
  position: fixed;
  inset: 32px;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: 0 18px 60px rgba(2, 8, 20, 0.35);
  font-family: system-ui, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  user-select: none;
}

/* 拖动把手：窗口 movable 时 header 整条拖动（OS 级移动，零几何计算） */
.set-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 10px;
  -webkit-app-region: drag;
}

.set-card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
}

.set-card__close {
  border: none;
  background: transparent;
  width: 26px;
  height: 26px;
  padding: 0;
  font-size: 17px;
  line-height: 26px;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: 7px;
  flex-shrink: 0;
  transition: background-color 0.12s, color 0.12s;
  /* 拖动把手内的交互元素豁免（否则点击落进窗口拖动） */
  -webkit-app-region: no-drag;
}

.set-card__close:hover {
  color: var(--foreground);
  background: var(--muted);
}

/* 设置内容可滚动：窗口高度固定，超长列表内部滚 */
.set-card__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 2px 18px 16px;
}
</style>

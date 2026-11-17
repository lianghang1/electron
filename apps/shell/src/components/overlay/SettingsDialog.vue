<script setup lang="ts">
import type { SettingField, SettingGroup, SettingsValues, ThemePreference } from '@shell/shared'
import { X } from '@lucide/vue'
import { shell } from '@shell/bridge/client'
import { Button } from '@ui/components/button'
import { Input } from '@ui/components/input'
import { ScrollArea } from '@ui/components/scroll-area'
import { Switch } from '@ui/components/switch'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { applyAccent, applyTheme } from '../../styles/appearance'

/** isKiosk 由发起方经 payload 传入（present({ surface: 'settings', payload: { isKiosk } })） */
const props = defineProps<{ isKiosk?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const ACCENT_RE = /^#[0-9a-f]{6}$/i

interface AppSummary {
  manifest: { id: string, name: string }
}

const schema = ref<SettingGroup[]>([])
const values = ref<SettingsValues>({})
const apps = ref<AppSummary[]>([])
const busy = ref(false)
const actionError = ref('')

/** 表面挂载即模态边界（容器已配对遮罩），ESC = 关闭 */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
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
  <!-- dialog 表面面板本体：遮罩/居中/外点关闭由 SurfaceOutlet 容器配对 -->
  <div class="flex h-[600px] max-h-full w-[560px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
    <header class="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
      <h2 class="text-base leading-none font-semibold">
        设置
      </h2>
      <Button variant="ghost" size="icon-sm" aria-label="关闭设置" @click="emit('close')">
        <X />
      </Button>
    </header>

    <ScrollArea class="min-h-0 flex-1">
      <div class="space-y-5 px-5 py-4">
        <div v-for="group in schema" :key="group.key">
          <p class="mb-2 text-sm font-medium text-muted-foreground">
            {{ group.label }}
          </p>
          <div class="overflow-hidden rounded-md border border-border">
            <div
              v-for="field in visibleFields(group)"
              :key="field.key"
              class="flex items-center justify-between gap-4 border-b border-border px-3.5 py-3 last:border-b-0"
            >
              <div class="min-w-0">
                <p class="text-sm text-foreground">
                  {{ field.label }}
                </p>
                <p v-if="field.description" class="mt-0.5 text-sm text-muted-foreground">
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
          <p class="mb-2 text-sm font-medium text-muted-foreground">
            应用数据
          </p>
          <div class="overflow-hidden rounded-md border border-border">
            <div
              v-for="app in apps"
              :key="app.manifest.id"
              class="flex items-center justify-between gap-4 border-b border-border px-3.5 py-3 last:border-b-0"
            >
              <div class="min-w-0">
                <p class="truncate text-sm text-foreground">
                  {{ app.manifest.name }}
                </p>
                <p class="mt-0.5 truncate text-xs text-muted-foreground">
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
            <p v-if="apps.length === 0" class="px-3.5 py-3 text-sm text-muted-foreground">
              暂无已注册应用
            </p>
          </div>
          <p v-if="actionError" class="mt-1.5 text-xs text-destructive">
            {{ actionError }}
          </p>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import type { SettingField, SettingGroup, SettingsValues, ThemePreference } from '@shell/shared'
import { desktop } from '@shell/bridge/client'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Switch } from '@ui/components/ui'
import { onMounted, ref } from 'vue'
import { applyAccent, applyTheme } from '../styles/appearance'

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

onMounted(async () => {
  const snap = await desktop().settings.all() as { schema: SettingGroup[], values: SettingsValues }
  schema.value = snap.schema
  values.value = snap.values
  try {
    apps.value = await desktop().apps.list() as AppSummary[]
  }
  catch {
    apps.value = []
  }
})

async function clearAppData(appId: string, scope: 'cache' | 'site-data'): Promise<void> {
  busy.value = true
  actionError.value = ''
  try {
    if (scope === 'cache') { await desktop().sessions.clearCache(appId) }
    else { await desktop().sessions.clearSiteData(appId) }
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
  await desktop().settings.set(key, value)
}

function visibleFields(group: SettingGroup) {
  return group.fields.filter(f => !(props.isKiosk && f.hiddenInKiosk))
}
</script>

<template>
  <Dialog :open="props.open" @update:open="v => emit('update:open', v)">
    <DialogContent width="560px">
      <DialogHeader>
        <DialogTitle>设置</DialogTitle>
      </DialogHeader>

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
    </DialogContent>
  </Dialog>
</template>

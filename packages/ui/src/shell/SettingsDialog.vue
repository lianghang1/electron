<script setup lang="ts">
import type { SettingField, SettingGroup, SettingsValues, ThemePreference } from '@shell/shared'
import { desktop } from '@shell/bridge/client'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Switch } from '@ui/components/ui'
import { onMounted, ref } from 'vue'
import { applyTheme } from '../styles/appearance'

const props = defineProps<{ open: boolean, isKiosk?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const schema = ref<SettingGroup[]>([])
const values = ref<SettingsValues>({})

onMounted(async () => {
  const snap = await desktop().settings.all() as { schema: SettingGroup[], values: SettingsValues }
  schema.value = snap.schema
  values.value = snap.values
})

function fieldValue(group: string, field: SettingField): unknown {
  return values.value[group]?.[field.key] ?? field.default
}

async function setField(group: string, field: SettingField, value: unknown) {
  values.value[group] = { ...values.value[group], [field.key]: value }
  const key = `${group}.${field.key}`
  if (key === 'appearance.theme') { applyTheme(value as ThemePreference) }
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
    </DialogContent>
  </Dialog>
</template>

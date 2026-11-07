<script setup lang="ts">
/**
 * SettingsDialog：schema 驱动的统一设置面板。
 * 渲染 SETTINGS_SCHEMA（唯一事实源）：boolean→Switch / enum→分段选择 /
 * string·number→Input；kiosk 模式隐藏 hiddenInKiosk 项。
 * 新增设置项只在 @shell/shared 的 schema 加字段——本文件永不改。
 */
import { onMounted, ref } from 'vue'
import type { SettingField, SettingGroup, SettingsValues, ThemePreference } from '@shell/shared'
import { desktop } from '@shell/bridge/client'
import { applyTheme } from '../styles/appearance'
import DtDialog from '../components/DtDialog.vue'
import DtInput from '../components/DtInput.vue'
import DtSwitch from '../components/DtSwitch.vue'

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
  if (key === 'appearance.theme')
    applyTheme(value as ThemePreference)
  await desktop().settings.set(key, value)
}

const visibleFields = (group: SettingGroup) =>
  group.fields.filter(f => !(props.isKiosk && f.hiddenInKiosk))
</script>

<template>
  <DtDialog :open="props.open" title="设置" width="560px" @update:open="v => emit('update:open', v)">
    <div v-for="group in schema" :key="group.key" class="mb-5 last:mb-0">
      <p class="mb-2 text-xs font-medium" style="color: var(--dt-text-3)">{{ group.label }}</p>
      <div class="overflow-hidden rounded-xl" style="border: 1px solid var(--dt-line)">
        <div
          v-for="field in visibleFields(group)"
          :key="field.key"
          class="flex items-center justify-between gap-4 px-3.5 py-3"
          style="border-bottom: 1px solid var(--dt-line)"
        >
          <div class="min-w-0">
            <p class="text-[13px]" style="color: var(--dt-text-1)">{{ field.label }}</p>
            <p v-if="field.description" class="mt-0.5 text-xs" style="color: var(--dt-text-3)">{{ field.description }}</p>
          </div>
          <DtSwitch
            v-if="field.type === 'boolean'"
            :model-value="fieldValue(group.key, field) === true"
            @update:model-value="v => setField(group.key, field, v)"
          />
          <div v-else-if="field.type === 'enum'" class="flex gap-1">
            <button
              v-for="opt in field.options ?? []"
              :key="opt.value"
              class="h-7 px-2.5 text-xs transition-colors"
              :style="{
                borderRadius: 'var(--dt-radius)',
                background: fieldValue(group.key, field) === opt.value ? 'var(--dt-accent)' : 'var(--dt-page)',
                color: fieldValue(group.key, field) === opt.value ? '#fff' : 'var(--dt-text-2)',
              }"
              @click="setField(group.key, field, opt.value)"
            >{{ opt.label }}</button>
          </div>
          <DtInput
            v-else
            class="w-40"
            :model-value="String(fieldValue(group.key, field))"
            @update:model-value="v => setField(group.key, field, field.type === 'number' ? Number(v) : v)"
          />
        </div>
      </div>
    </div>
  </DtDialog>
</template>

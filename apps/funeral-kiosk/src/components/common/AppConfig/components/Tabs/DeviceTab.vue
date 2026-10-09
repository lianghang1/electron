<script setup lang="ts">
import type { AppConfigData } from '@shared/types'
import type { FormConfig } from '../DynamicForm.vue'
import DynamicForm from '../DynamicForm.vue'

const appStore = useAppStore()
const globalMessageStore = useGlobalMessageStore()
const visible = ref(false)

const formConfig = reactive<FormConfig>({
  fields: [
    {
      field: 'deviceId',
      type: 'select',
      label: '设备名称',
      options: [],
    },
    {
      field: 'inactivityTimeout',
      type: 'number',
      min: 60,
      label: '超时关闭时间',
    },
    {
      field: 'scannerValidatePrefixe',
      type: 'switch',
      label: '验证二维码前缀',
    },
  ],
})

const formData = ref({
  deviceId: appStore.deviceId,
  inactivityTimeout: appStore.inactivityTimeout,
  scannerValidatePrefixe: appStore.scannerValidatePrefixe,
})

function handleGetData() {
  const deviceField = formConfig.fields.find(e => e.field === 'deviceId')
  if (deviceField) {
    deviceField.options = appStore.devices
  }
  visible.value = true
}

function handleBlur(data: any) {
  let isChanged = false
  for (const attr in data) {
    const newValue = data[attr as keyof AppConfigData]
    const oldValue = appStore.getFieldConfigValue(attr as keyof AppConfigData)
    if (newValue !== oldValue) {
      isChanged = true
      appStore.setFieldConfigValue(attr as keyof AppConfigData, newValue)
      if (attr === 'deviceId') {
        const device = appStore.devices.find(device => device.value === newValue)
        appStore.setFieldConfigValue('deviceName', device?.label || '')
      }
    }
  }
  if (isChanged) {
    globalMessageStore.success({
      title: '配置更新成功',
    })
  }
}

onMounted(() => {
  handleGetData()
})
</script>

<template>
  <div v-if="visible">
    <DynamicForm
      v-model="formData"
      :form-config="formConfig"
      @blur="handleBlur"
    />
  </div>
</template>

<style lang="scss" scoped>

</style>

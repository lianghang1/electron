import type { ScannerConfig } from '@desktop/shared'
import type { AppConfig, DeviceConfig, DeviceData } from './types'
import { parseJson } from '@desktop/utils'
import { defineStore } from 'pinia'

import PaymentApi from '@/api/payment'

const APP_CONFIG_KEY = 'AppConfig'

function defaultConfigData(): AppConfig {
  return {
    deviceId: '',
    deviceName: '',
    inactivityTimeout: 300,
    scannerRequirePrefix: false,
    scannerPrefixes: [],
    authPassword: '789123',
    superAuthPassword: 'sfi@123456789',
  }
}

async function getDevices(): Promise<DeviceData[]> {
  const data = await PaymentApi.getTerminals()
  return (data || []).map((item) => {
    return {
      label: item.counterName,
      value: item.counterCode,
      config: parseJson(item.itemConfig, {}) as DeviceConfig,
    } as DeviceData
  })
}

async function getAppConfigData(): Promise<AppConfig | undefined> {
  return await window.desktop.storage.get(APP_CONFIG_KEY) as AppConfig | undefined
}

async function setAppConfigData(data: AppConfig): Promise<void> {
  await window.desktop.storage.set(APP_CONFIG_KEY, data)
}

function getScannerConfigData(): Promise<ScannerConfig> {
  return window.desktop.scanner.getConfig()
}

async function setScannerConfigData(data: Partial<ScannerConfig>): Promise<ScannerConfig> {
  return await window.desktop.scanner.setConfig(data)
}

async function applyAppConfigData(): Promise<AppConfig | undefined> {
  let config: AppConfig | undefined = await getAppConfigData()
  if (!config) {
    const scannerConfig = await getScannerConfigData()
    const config = defaultConfigData()
    if (scannerConfig) {
      config.scannerRequirePrefix = scannerConfig.requirePrefix
      config.scannerPrefixes = scannerConfig.prefixes
    }
    // 初始化配置
    await setAppConfigData(config)
  }
  else {
    config = await getAppConfigData()
  }
  return config
}

let setting = false

export const useAppStore = defineStore('app-store', () => {
  const devices = ref<DeviceData[]>([])
  const config = reactive<AppConfig>(defaultConfigData())

  const deviceData = computed(() => {
    return devices.value?.find(e => e.value === config.deviceId)
  })

  const deviceBusinessType = computed(() => {
    return deviceData.value?.config?.businessType
  })

  async function setFieldConfigValue<K extends keyof AppConfig>(field: K, value: AppConfig[K]) {
    if (setting) {
      return
    }
    try {
      setting = true
      config[field] = value
      if (['scannerRequirePrefix', 'scannerPrefixes'].includes(field)) {
        await setScannerConfigData({
          requirePrefix: config.scannerRequirePrefix,
          prefixes: config.scannerPrefixes,
        })
      }
      else {
        await setAppConfigData(config)
      }
    }
    finally {
      setting = false
    }
  }

  function getFieldConfigValue<K extends keyof AppConfig>(field: K) {
    return config[field]
  }

  async function initApp() {
    try {
      const [configData, deviceList] = await Promise.all([applyAppConfigData(), getDevices()])
      devices.value = deviceList
      Object.assign(config, configData)

      if (config.deviceId) {
        const device = deviceList.find(device => device.value === config.deviceId)
        if (!device) {
          config.deviceId = ''
          config.deviceName = ''
        }
      }

      console.log(`[App] 初始化 🚀 deviceId: ${config.deviceId}`)
    }
    catch (err) {
      console.error('初始化失败:', err)
    }
  }

  return {
    ...toRefs(config),
    devices,
    deviceData,
    deviceBusinessType,

    initApp,
    setFieldConfigValue,
    getFieldConfigValue,
  }
})

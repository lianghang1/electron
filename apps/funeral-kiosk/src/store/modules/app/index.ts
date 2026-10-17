import type { ScannerConfig } from '@desktop/shared'
import type { AppConfig, DeviceConfig, DeviceData } from './types'
import { encryptWithAES, parseJson } from '@desktop/utils'
import { defineStore } from 'pinia'
import PaymentApi from '@/api/payment'

import { useAuthStore } from '../auth'

const APP_CONFIG_KEY = 'AppConfig'
const APP_CONFIG_ENCRYPTED_KEY = 'vvHHNOftiyEqp9Xn'

function toPlainData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T
}

function defaultConfigData(): AppConfig {
  return {
    deviceId: '',
    deviceName: '',
    inactivityTimeout: 300,
    scannerRequirePrefix: false,
    scannerPrefixes: ['PB:'],
    authPassword: encryptWithAES('789123', APP_CONFIG_ENCRYPTED_KEY),
    superAuthPassword: encryptWithAES('sfi@123456789', APP_CONFIG_ENCRYPTED_KEY),
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
  await window.desktop.storage.set({ key: APP_CONFIG_KEY, value: toPlainData(data) })
}

async function setScannerConfigData(data: Partial<ScannerConfig>): Promise<ScannerConfig> {
  return await window.desktop.scanner.setConfig(toPlainData(data))
}

async function applyAppConfigData(): Promise<AppConfig | undefined> {
  let config: AppConfig | undefined = await getAppConfigData()
  if (!config) {
    const config = defaultConfigData()
    // 初始化配置
    setScannerConfigData({
      requirePrefix: config.scannerRequirePrefix,
      prefixes: config.scannerPrefixes,
    })
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

  const authStore = useAuthStore()

  const deviceData = computed(() => {
    return devices.value?.find(e => e.value === config.deviceId)
  })

  const deviceBusinessType = computed(() => {
    return deviceData.value?.config?.businessType
  })

  async function setFieldConfigValue<K extends keyof AppConfig>(field: K, value: AppConfig[K]) {
    if (setting) {
      throw new Error('配置正在设置中')
    }
    try {
      setting = true
      config[field] = value

      await Promise.all([
        setAppConfigData(config),
        setScannerConfigData({
          requirePrefix: config.scannerRequirePrefix,
          prefixes: config.scannerPrefixes,
        }),
      ])
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

      console.log(`[App] 初始化 🚀 deviceId: ${config.deviceId} accessInfo: ${JSON.stringify(authStore.accessInfo)}`)
    }
    catch (err) {
      console.error('初始化失败:', err)
    }
  }

  function validateConfigAuthPassword(password: string): boolean {
    const inputPassword = encryptWithAES(password, APP_CONFIG_ENCRYPTED_KEY)
    if (inputPassword === config.authPassword || inputPassword === config.superAuthPassword) {
      return true
    }
    return false
  }

  async function updateConfigAuthPassword(password: string, newPassword: string) {
    if (!validateConfigAuthPassword(password)) {
      throw new Error('旧密码错误')
    }
    await setFieldConfigValue('authPassword', encryptWithAES(newPassword, APP_CONFIG_ENCRYPTED_KEY))
  }

  return {
    ...toRefs(config),
    devices,
    deviceData,
    deviceBusinessType,

    initApp,
    setFieldConfigValue,
    getFieldConfigValue,
    updateConfigAuthPassword,
    validateConfigAuthPassword,
  }
})

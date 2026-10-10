export interface AppConfig {
  deviceId: string
  deviceName: string
  inactivityTimeout: number
  scannerRequirePrefix: boolean
  scannerPrefixes: string[]
  authPassword: string
  superAuthPassword: string
}

export interface DeviceConfig {
  businessType?: string
  [key: string]: any
}

export interface DeviceData {
  label: string
  value: string
  config?: DeviceConfig
}

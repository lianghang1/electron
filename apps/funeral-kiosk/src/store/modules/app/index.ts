import type { AppState } from './types'
import { isEmpty, nanoid, Storage } from '@desktop/utils'
import { defineStore } from 'pinia'
import { httpContext } from '@/http'

const DEVICE_ID_KEY = 'deviceId'

function getPersistentDeviceId(): string {
  let deviceId = Storage.getSync(DEVICE_ID_KEY)
  if (isEmpty(deviceId)) {
    deviceId = nanoid()
    Storage.set(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

export const useAppStore = defineStore('app-store', {
  state: (): AppState => ({
    deviceId: '',
  }),

  actions: {
    initApp() {
      this.deviceId = getPersistentDeviceId()

      httpContext.set({
        showError: (msg?: string | null) => {
          if (msg) {
            console.log(msg)
          }
        },
        showLoading: () => {

        },
        hideLoading: () => {

        },
      })

      console.log(`[App] 初始化 🚀 deviceId: ${this.deviceId}`)
    },
  },
})
